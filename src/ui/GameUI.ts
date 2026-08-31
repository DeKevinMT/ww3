import { executeAiTurn, type AiStep } from '../game/ai/strategist';
import eonscarLogoUrl from '../assets/brand/eonscar-logo-transparent.png?url';
import { findTradeSetIndices } from '../game/cards';
import { predictBattle, resolveStackRound } from '../game/combat';
import { REGION_BY_ID, REGIONS, TERRITORIES, TERRITORY_BY_ID } from '../game/data/map';
import { UNIT_DEFINITIONS, UNIT_ORDER, countUnitTypes, stackHp, stackValue } from '../game/data/units';
import { GameEngine } from '../game/engine';
import { mapBridge } from '../game/map/bridge';
import {
  controlledRegions,
  enemyNeighbors,
  findOwnedPath,
  reinforcementIncome,
  territoriesOwnedBy,
  territoryCount,
} from '../game/selectors';
import type {
  CombatRoundResult,
  GameState,
  Phase,
  StateChange,
  TerritoryId,
  UnitId,
  UnitInstance,
  UnitType,
} from '../game/types';

interface SelectionCounts {
  infantry: number;
  armor: number;
  artillery: number;
}

const PHASE_LABELS: Record<Phase, string> = {
  reinforce: 'Versterken',
  attack: 'Aanvallen',
  fortify: 'Fortificeren',
  gameover: 'Einde',
};

function emptyCounts(): SelectionCounts {
  return { infantry: 0, armor: 0, artillery: 0 };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export class GameUI {
  private readonly hud: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private sourceId?: TerritoryId;
  private targetId?: TerritoryId;
  private inspectId?: TerritoryId;
  private selectedUnitType: UnitType = 'infantry';
  private selectedCounts: SelectionCounts = emptyCounts();
  private lastCombat?: CombatRoundResult;
  private introOpen = true;
  private helpOpen = false;
  private cardsOpen = false;
  private logOpen = false;
  private aiBusy = false;
  private aiStep?: AiStep;
  private aiDelay = 430;
  private unsubscribe?: () => void;

  constructor(private readonly engine: GameEngine) {
    this.hud = document.querySelector<HTMLElement>('#hud')!;
    this.tooltip = document.querySelector<HTMLElement>('#tooltip')!;
    this.toastLayer = document.querySelector<HTMLElement>('#toast-layer')!;
    mapBridge.engine = engine;
    mapBridge.onTerritoryClick = (territoryId) => this.onTerritoryClick(territoryId);
    mapBridge.onTerritoryHover = (territoryId, x, y) => this.onTerritoryHover(territoryId, x, y);
    this.unsubscribe = engine.subscribe((state, change) => this.onStateChange(state, change));
  }

  destroy(): void {
    this.unsubscribe?.();
  }

  private onStateChange(_state: GameState, change: StateChange): void {
    if (change.combat) {
      this.lastCombat = change.combat;
      mapBridge.scene?.playCombat(change.combat);
    }
    mapBridge.sync();
    this.sanitizeSelection();
    this.render();
    this.maybeRunAi();
  }

  private sanitizeSelection(): void {
    const state = this.engine.state;
    const player = this.engine.activePlayer;
    if (this.sourceId && state.territories[this.sourceId]?.ownerId !== player.id) this.sourceId = undefined;
    if (this.targetId && !state.territories[this.targetId]) this.targetId = undefined;
    if (state.phase === 'reinforce') this.targetId = undefined;
    if (state.phase === 'gameover') {
      this.sourceId = undefined;
      this.targetId = undefined;
    }
    this.updateMapSelection();
  }

  private async maybeRunAi(): Promise<void> {
    const player = this.engine.activePlayer;
    if (this.introOpen || this.aiBusy || player.isHuman || player.eliminated || this.engine.state.phase === 'gameover') return;
    this.aiBusy = true;
    this.sourceId = undefined;
    this.targetId = undefined;
    this.updateMapSelection();
    this.render();
    await delay(350);
    try {
      await executeAiTurn(this.engine, async (step) => {
        this.aiStep = step;
        if (step.sourceId || step.targetId) mapBridge.scene?.focusAction(step.sourceId, step.targetId);
        this.render();
        await delay(this.aiDelay);
      });
    } finally {
      this.aiStep = undefined;
      this.aiBusy = false;
      this.render();
      window.setTimeout(() => void this.maybeRunAi(), 100);
    }
  }

  private onTerritoryClick(territoryId: TerritoryId): void {
    const state = this.engine.state;
    const active = this.engine.activePlayer;
    const territory = state.territories[territoryId];
    this.inspectId = territoryId;

    if (this.introOpen || this.helpOpen || this.aiBusy || !active.isHuman || state.phase === 'gameover') {
      this.render();
      return;
    }

    if (state.phase === 'reinforce') {
      this.sourceId = territoryId;
      if (territory.ownerId === active.id) {
        const placed = this.engine.placeUnit(active.id, territoryId, this.selectedUnitType);
        if (!placed) this.toast('Onvoldoende versterkingspunten voor deze unit.');
      }
      this.updateMapSelection();
      this.render();
      return;
    }

    if (state.phase === 'attack') {
      if (!this.sourceId) {
        if (territory.ownerId === active.id && territory.units.length > 1) {
          this.selectSource(territoryId);
        } else {
          this.toast('Kies een eigen gebied met minstens twee units.');
        }
        return;
      }

      if (territoryId === this.sourceId) {
        this.clearSelection();
      } else if (territory.ownerId === active.id) {
        if (territory.units.length > 1) this.selectSource(territoryId);
        else this.toast('Dit gebied heeft geen mobiele units.');
      } else if (TERRITORY_BY_ID[this.sourceId]?.neighbors.includes(territoryId)) {
        this.targetId = territoryId;
        this.selectedCounts = this.maximumMovableCounts(this.sourceId);
        this.updateMapSelection();
        this.render();
      } else {
        this.toast('Je kunt alleen een aangrenzend vijandelijk gebied aanvallen.');
      }
      return;
    }

    if (state.phase === 'fortify') {
      if (!this.sourceId) {
        if (territory.ownerId === active.id && territory.units.length > 1) this.selectSource(territoryId);
        else this.toast('Kies een eigen brongebied met minstens twee units.');
        return;
      }
      if (territoryId === this.sourceId) {
        this.clearSelection();
      } else if (territory.ownerId === active.id && findOwnedPath(state, active.id, this.sourceId, territoryId)) {
        this.targetId = territoryId;
        this.selectedCounts = this.maximumMovableCounts(this.sourceId);
        this.updateMapSelection();
        this.render();
      } else {
        this.toast('Bestemming moet via jouw eigen gebieden verbonden zijn.');
      }
    }
  }

  private selectSource(territoryId: TerritoryId): void {
    this.sourceId = territoryId;
    this.targetId = undefined;
    this.selectedCounts = this.maximumMovableCounts(territoryId);
    this.updateMapSelection();
    this.render();
  }

  private clearSelection(): void {
    this.sourceId = undefined;
    this.targetId = undefined;
    this.selectedCounts = emptyCounts();
    this.updateMapSelection();
    this.render();
  }

  private maximumMovableCounts(territoryId: TerritoryId): SelectionCounts {
    const allowed = new Set(this.engine.defaultMovableUnitIds(territoryId));
    return countUnitTypes((this.engine.state.territories[territoryId]?.units ?? []).filter((unit) => allowed.has(unit.id)));
  }

  private selectedUnitIds(): UnitId[] {
    if (!this.sourceId) return [];
    const allowed = new Set(this.engine.defaultMovableUnitIds(this.sourceId));
    const chosen: UnitId[] = [];
    for (const type of UNIT_ORDER) {
      const candidates = (this.engine.state.territories[this.sourceId]?.units ?? [])
        .filter((unit) => allowed.has(unit.id) && unit.type === type)
        .sort((left, right) => left.hp - right.hp || left.id.localeCompare(right.id));
      chosen.push(...candidates.slice(0, this.selectedCounts[type]).map((unit) => unit.id));
    }
    return chosen;
  }

  private legalTargets(): TerritoryId[] {
    if (!this.sourceId) return [];
    const state = this.engine.state;
    const active = this.engine.activePlayer;
    if (state.phase === 'attack') return enemyNeighbors(state, this.sourceId);
    if (state.phase === 'fortify') {
      return territoriesOwnedBy(state, active.id)
        .map((territory) => territory.id)
        .filter((territoryId) => territoryId !== this.sourceId && findOwnedPath(state, active.id, this.sourceId!, territoryId));
    }
    return [];
  }

  private updateMapSelection(): void {
    mapBridge.setSelection({ sourceId: this.sourceId, targetId: this.targetId, legalTargetIds: this.legalTargets() });
  }

  private onTerritoryHover(territoryId: TerritoryId | undefined, x: number, y: number): void {
    if (!territoryId) {
      this.tooltip.classList.remove('is-visible');
      return;
    }
    const territory = this.engine.state.territories[territoryId];
    const definition = TERRITORY_BY_ID[territoryId];
    const owner = this.engine.state.players.find((player) => player.id === territory?.ownerId);
    if (!territory || !definition || !owner) return;
    const counts = countUnitTypes(territory.units);
    const hp = stackHp(territory.units);
    this.tooltip.innerHTML = `
      <div class="tooltip__eyebrow">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? '')}</div>
      <strong>${escapeHtml(definition.name)}</strong>
      <span style="color:${owner.cssColor}">${escapeHtml(owner.name)}</span>
      <div class="tooltip__stats">I ${counts.infantry} · P ${counts.armor} · A ${counts.artillery}<br>HP ${hp.current}/${hp.max}</div>
    `;
    this.tooltip.style.left = `${Math.min(window.innerWidth - 210, x + 16)}px`;
    this.tooltip.style.top = `${Math.min(window.innerHeight - 130, y + 14)}px`;
    this.tooltip.classList.add('is-visible');
  }

  private toast(message: string): void {
    const element = document.createElement('div');
    element.className = 'toast';
    element.textContent = message;
    this.toastLayer.append(element);
    window.setTimeout(() => element.classList.add('toast--show'), 20);
    window.setTimeout(() => {
      element.classList.remove('toast--show');
      window.setTimeout(() => element.remove(), 220);
    }, 2300);
  }

  private executeAttack(untilResolved: boolean): void {
    if (!this.sourceId || !this.targetId) return;
    const unitIds = this.selectedUnitIds();
    if (unitIds.length === 0) {
      this.toast('Selecteer minstens één aanvallende unit.');
      return;
    }
    const sourceBefore = this.sourceId;
    const targetBefore = this.targetId;
    const result = this.engine.attack(this.engine.activePlayer.id, sourceBefore, targetBefore, unitIds, untilResolved);
    if (!result) {
      this.toast('Deze aanval is niet meer geldig.');
      return;
    }
    if (result.conquered && this.engine.state.territories[targetBefore]?.units.length > 1) {
      this.sourceId = targetBefore;
      this.targetId = undefined;
      this.selectedCounts = this.maximumMovableCounts(targetBefore);
    } else if (!result.conquered && this.engine.state.territories[sourceBefore]?.units.length > 1) {
      this.sourceId = sourceBefore;
      this.targetId = targetBefore;
      const maximum = this.maximumMovableCounts(sourceBefore);
      for (const type of UNIT_ORDER) this.selectedCounts[type] = Math.min(this.selectedCounts[type], maximum[type]);
    } else {
      this.sourceId = undefined;
      this.targetId = undefined;
    }
    this.updateMapSelection();
    this.render();
  }

  private executeFortify(): void {
    if (!this.sourceId || !this.targetId) return;
    const unitIds = this.selectedUnitIds();
    if (unitIds.length === 0) {
      this.toast('Selecteer minstens één unit om te verplaatsen.');
      return;
    }
    if (this.engine.fortify(this.engine.activePlayer.id, this.sourceId, this.targetId, unitIds)) {
      this.clearSelection();
    }
  }

  private adjustCount(type: UnitType, delta: number): void {
    if (!this.sourceId) return;
    const maximum = this.maximumMovableCounts(this.sourceId)[type];
    this.selectedCounts[type] = Math.max(0, Math.min(maximum, this.selectedCounts[type] + delta));
    this.render();
  }

  private render(): void {
    const state = this.engine.state;
    const active = this.engine.activePlayer;
    const human = state.players.find((player) => player.isHuman);
    const humanTerritories = human ? territoryCount(state, human.id) : 0;
    const humanIncome = human ? reinforcementIncome(state, human.id) : 0;
    const selected = this.inspectId ? state.territories[this.inspectId] : undefined;
    const phaseOrder: Phase[] = ['reinforce', 'attack', 'fortify'];

    this.hud.innerHTML = `
      <header class="topbar glass-panel">
        <div class="brand">
          <div class="brand__mark"><img src="${eonscarLogoUrl}" alt=""></div>
          <div><strong>EONSCAR</strong><span>TACTICAL WORLD NETWORK</span></div>
        </div>
        <div class="phase-strip" aria-label="Beurtfases">
          ${phaseOrder.map((phase, index) => `
            <div class="phase-step ${state.phase === phase ? 'is-active' : ''} ${phaseOrder.indexOf(state.phase) > index ? 'is-done' : ''}">
              <span>${phaseOrder.indexOf(state.phase) > index ? '✓' : index + 1}</span>${PHASE_LABELS[phase]}
            </div>
          `).join('')}
        </div>
        <div class="turn-status">
          <span>BEURT ${state.turn}</span>
          <strong style="color:${active.cssColor}">${escapeHtml(active.name)} · ${PHASE_LABELS[state.phase]}</strong>
        </div>
        <div class="top-actions">
          <button class="icon-button" data-action="camera-reset" title="Kaart centreren">⌖</button>
          <button class="icon-button" data-action="help" title="Speluitleg">?</button>
        </div>
      </header>

      <aside class="player-rail glass-panel" aria-label="Facties">
        ${state.players.map((player) => {
          const territories = territoryCount(state, player.id);
          const hp = territoriesOwnedBy(state, player.id).reduce((sum, territory) => sum + stackHp(state.territories[territory.id]!.units).current, 0);
          return `
            <div class="player-card ${player.id === active.id ? 'is-active' : ''} ${player.eliminated ? 'is-eliminated' : ''}" style="--player:${player.cssColor}" title="${escapeHtml(player.profile)}">
              <div class="player-card__sigil">${player.sigil}</div>
              <div><strong>${escapeHtml(player.name)}</strong><span>${territories} gebieden · ${hp} HP · ${player.cards.length} kaarten</span><em>${escapeHtml(player.influences[0] ?? '')}</em></div>
            </div>
          `;
        }).join('')}
      </aside>

      <div class="mission-chip glass-panel">
        <span>DOEL</span>
        <strong>Verover alle 30 gebieden</strong>
      </div>

      <div class="region-chip glass-panel">
        ${REGIONS.map((region) => {
          const controller = state.players.find((player) => controlsRegion(state, player.id, region.id));
          return `<span title="${escapeHtml(region.name)}: +${region.bonus}"><i style="--region:#${region.color.toString(16).padStart(6, '0')}"></i>${escapeHtml(region.name)} <b>+${region.bonus}</b>${controller ? `<em style="color:${controller.cssColor}">${controller.sigil}</em>` : ''}</span>`;
        }).join('')}
      </div>

      ${this.renderContextPanel(selected)}
      ${this.renderBottomBar(humanTerritories, humanIncome)}
      ${this.renderLog()}
      ${this.aiBusy ? `
        <div class="ai-banner glass-panel">
          <div class="ai-pulse"></div>
          <div><span>STRATEEG DENKT</span><strong>${escapeHtml(this.aiStep?.message ?? `${active.name} analyseert de kaart…`)}</strong></div>
          <button data-action="ai-speed">${this.aiDelay > 200 ? '2× SNELHEID' : '1× SNELHEID'}</button>
        </div>
      ` : ''}
      ${this.introOpen ? this.renderIntro() : ''}
      ${this.helpOpen ? this.renderHelp() : ''}
      ${this.cardsOpen ? this.renderCards() : ''}
      ${state.phase === 'gameover' ? this.renderGameOver() : ''}
    `;
    this.bindActions();
  }

  private renderContextPanel(selected?: GameState['territories'][string]): string {
    const state = this.engine.state;
    if (this.targetId && this.sourceId && state.phase === 'attack') return this.renderBattlePanel();
    if (this.targetId && this.sourceId && state.phase === 'fortify') return this.renderFortifyPanel();
    const territory = selected ?? (this.sourceId ? state.territories[this.sourceId] : undefined);
    if (!territory) {
      return `
        <aside class="context-panel glass-panel context-panel--quiet">
          <div class="panel-kicker">${PHASE_LABELS[state.phase]}</div>
          <h2>${state.phase === 'reinforce' ? 'Bouw je frontlinie' : state.phase === 'attack' ? 'Kies een aanvalsbasis' : 'Verplaats je reserves'}</h2>
          <p>${state.phase === 'reinforce'
            ? 'Kies onderaan een unittype en klik een eigen gebied om het te plaatsen.'
            : state.phase === 'attack'
              ? 'Selecteer een eigen gebied met minstens twee units. Aangrenzende doelen lichten daarna op.'
              : 'Selecteer een brongebied en daarna een verbonden eigen bestemming.'}</p>
          <div class="formation-note"><span>2</span> frontslots <span>1</span> supportslot<br><small>De verdediger vuurt iedere gevechtsronde eerst.</small></div>
        </aside>
      `;
    }
    const definition = TERRITORY_BY_ID[territory.id]!;
    const owner = state.players.find((player) => player.id === territory.ownerId)!;
    const hp = stackHp(territory.units);
    const unitsByType = UNIT_ORDER.map((type) => {
      const units = territory.units.filter((unit) => unit.type === type);
      const currentHp = units.reduce((sum, unit) => sum + unit.hp, 0);
      const max = units.length * UNIT_DEFINITIONS[type].maxHp;
      return `<div class="stack-row"><span class="unit-glyph unit-glyph--${type}">${UNIT_DEFINITIONS[type].icon}</span><div><strong>${UNIT_DEFINITIONS[type].name}</strong><small>${units.length} units · ${currentHp}/${max} HP</small></div><b>ATK ${UNIT_DEFINITIONS[type].attack}<br>DEF ${UNIT_DEFINITIONS[type].defense}</b></div>`;
    }).join('');
    const damaged = territory.units
      .filter((unit) => unit.hp < UNIT_DEFINITIONS[unit.type].maxHp)
      .sort((left, right) => left.hp - right.hp)[0];
    return `
      <aside class="context-panel glass-panel">
        <div class="panel-kicker">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? '')} · +${REGION_BY_ID[definition.regionId]?.bonus ?? 0}</div>
        <div class="territory-title"><div><h2>${escapeHtml(definition.name)}</h2><span style="color:${owner.cssColor}">${escapeHtml(owner.name)}</span></div><strong>${territory.units.length}</strong></div>
        <div class="hp-meter"><span style="width:${hp.max ? (hp.current / hp.max) * 100 : 0}%;background:${owner.cssColor}"></span></div>
        <div class="hp-caption">Totale slagkracht · ${hp.current}/${hp.max} HP · waarde ${formatValue(stackValue(territory.units))}</div>
        <div class="stack-list">${unitsByType}</div>
        ${state.phase === 'reinforce' && territory.ownerId === this.engine.activePlayer.id && damaged ? `
          <button class="secondary-button full-width" data-action="repair" data-unit-id="${damaged.id}">Herstel zwaarst beschadigde unit</button>
        ` : ''}
      </aside>
    `;
  }

  private renderBattlePanel(): string {
    const state = this.engine.state;
    const source = state.territories[this.sourceId!]!;
    const target = state.territories[this.targetId!]!;
    const selectedIds = new Set(this.selectedUnitIds());
    const attackers = source.units.filter((unit) => selectedIds.has(unit.id));
    const firstRound = attackers.length > 0 ? resolveStackRound(attackers, target.units) : undefined;
    const prediction = attackers.length > 0 ? predictBattle(attackers, target.units, 12) : undefined;
    const defender = state.players.find((player) => player.id === target.ownerId)!;
    return `
      <aside class="context-panel glass-panel battle-panel">
        <div class="panel-kicker">AANVAL · VERDEDIGER VUURT EERST</div>
        <div class="battle-route"><div><span>VAN</span><strong>${escapeHtml(TERRITORY_BY_ID[source.id]!.name)}</strong></div><b>→</b><div><span>NAAR</span><strong>${escapeHtml(TERRITORY_BY_ID[target.id]!.name)}</strong></div></div>
        <div class="versus-line"><span style="color:${this.engine.activePlayer.cssColor}">JOUW FORMATIE</span><span style="color:${defender.cssColor}">${escapeHtml(defender.name.toUpperCase())}</span></div>
        ${this.renderUnitSelectors(this.maximumMovableCounts(source.id), countUnitTypes(target.units))}
        <div class="combat-preview ${prediction?.willConquer ? 'is-positive' : 'is-risky'}">
          <div><span>EERSTE RONDE</span><strong>${firstRound ? `${firstRound.attackerDamageDealt} schade uit · ${firstRound.defenderDamageDealt} terug` : 'Selecteer units'}</strong></div>
          <div><span>DOORVECHTEN</span><strong>${prediction ? (prediction.willConquer ? `Verovering in ca. ${prediction.rounds} rondes` : 'Aanval loopt vast') : '—'}</strong></div>
          ${prediction ? `<small>Eigen waarde over: ${formatValue(prediction.attackerValueAfter)}/${formatValue(prediction.attackerValueBefore)} · Vijand: ${formatValue(prediction.defenderValueAfter)}/${formatValue(prediction.defenderValueBefore)}</small>` : ''}
        </div>
        <details class="formula"><summary>Hoe wordt schade berekend?</summary><p>Twee units vormen het front; de sterkste overgebleven aanvaller ondersteunt. Per hit: <code>max(1, ATK − DEF)</code>. Schade en HP zijn volledig deterministisch.</p></details>
        <div class="panel-actions three-actions">
          <button class="ghost-button" data-action="clear-selection">Annuleer</button>
          <button class="secondary-button" data-action="attack-round" ${attackers.length === 0 ? 'disabled' : ''}>1 ronde</button>
          <button class="primary-button" data-action="attack-until" ${attackers.length === 0 ? 'disabled' : ''}>Doorvechten</button>
        </div>
      </aside>
    `;
  }

  private renderFortifyPanel(): string {
    const state = this.engine.state;
    const source = state.territories[this.sourceId!]!;
    const target = state.territories[this.targetId!]!;
    const path = findOwnedPath(state, this.engine.activePlayer.id, source.id, target.id) ?? [];
    return `
      <aside class="context-panel glass-panel battle-panel">
        <div class="panel-kicker">FORTIFICATIE · ÉÉN VERPLAATSING</div>
        <div class="battle-route"><div><span>VAN</span><strong>${escapeHtml(TERRITORY_BY_ID[source.id]!.name)}</strong></div><b>→</b><div><span>NAAR</span><strong>${escapeHtml(TERRITORY_BY_ID[target.id]!.name)}</strong></div></div>
        ${this.renderUnitSelectors(this.maximumMovableCounts(source.id))}
        <div class="route-note">Veilige route via ${path.length} gebied${path.length === 1 ? '' : 'en'} · units behouden hun HP</div>
        <div class="panel-actions">
          <button class="ghost-button" data-action="clear-selection">Annuleer</button>
          <button class="primary-button" data-action="fortify" ${this.selectedUnitIds().length === 0 ? 'disabled' : ''}>Verplaatsen</button>
        </div>
      </aside>
    `;
  }

  private renderUnitSelectors(maximum: SelectionCounts, defenders?: SelectionCounts): string {
    return `<div class="unit-selectors">${UNIT_ORDER.map((type) => {
      const definition = UNIT_DEFINITIONS[type];
      return `
        <div class="unit-selector">
          <div class="unit-selector__identity"><span class="unit-glyph unit-glyph--${type}">${definition.icon}</span><div><strong>${definition.shortName}</strong><small>${definition.maxHp} HP · ${definition.attack} ATK · ${definition.defense} DEF</small></div></div>
          <div class="counter"><button data-action="adjust-count" data-type="${type}" data-delta="-1">−</button><strong>${this.selectedCounts[type]}</strong><button data-action="adjust-count" data-type="${type}" data-delta="1" ${this.selectedCounts[type] >= maximum[type] ? 'disabled' : ''}>+</button></div>
          ${defenders ? `<div class="enemy-count">vs ${defenders[type]}</div>` : ''}
        </div>
      `;
    }).join('')}</div>`;
  }

  private renderBottomBar(humanTerritories: number, humanIncome: number): string {
    const state = this.engine.state;
    const active = this.engine.activePlayer;
    const humanTurn = active.isHuman && !this.aiBusy;
    const canAdvance = state.phase !== 'reinforce' || state.reinforcementPoints === 0;
    const phaseAction = state.phase === 'reinforce'
      ? (state.reinforcementPoints > 0 ? `Besteed nog ${state.reinforcementPoints}` : 'Naar aanvallen')
      : state.phase === 'attack' ? 'Naar fortificeren' : state.phase === 'fortify' ? 'Beurt beëindigen' : 'Nieuwe campagne';
    return `
      <footer class="bottom-bar glass-panel">
        <div class="economy">
          <div><span>RESERVE</span><strong>${active.isHuman && state.phase === 'reinforce' ? state.reinforcementPoints : '—'}</strong></div>
          <div><span>GEBIEDEN</span><strong>${humanTerritories}/30</strong></div>
          <div><span>INKOMEN</span><strong>+${humanIncome}</strong></div>
          <button class="cards-button" data-action="cards">▤ ${state.players.find((player) => player.isHuman)?.cards.length ?? 0} KAARTEN</button>
        </div>
        ${state.phase === 'reinforce' && humanTurn ? `
          <div class="unit-shop" aria-label="Unittype kiezen">
            ${UNIT_ORDER.map((type) => {
              const definition = UNIT_DEFINITIONS[type];
              return `<button class="shop-card ${this.selectedUnitType === type ? 'is-selected' : ''}" data-action="select-unit" data-type="${type}" ${state.reinforcementPoints < definition.cost ? 'disabled' : ''}><span class="unit-glyph unit-glyph--${type}">${definition.icon}</span><div><strong>${definition.name}</strong><small>${definition.cost} RP · ${definition.maxHp} HP · ${definition.attack}/${definition.defense}</small></div></button>`;
            }).join('')}
          </div>
        ` : `<div class="phase-hint">${this.phaseHint()}</div>`}
        <div class="phase-actions">
          ${state.phase === 'reinforce' && active.isHuman && this.engine.canTrade(active.id) ? `<button class="secondary-button" data-action="trade-cards">Set inleveren</button>` : ''}
          <button class="primary-button phase-button" data-action="advance-phase" ${!humanTurn || !canAdvance || state.phase === 'gameover' ? 'disabled' : ''}>${phaseAction}<span>→</span></button>
        </div>
      </footer>
    `;
  }

  private phaseHint(): string {
    const state = this.engine.state;
    if (state.phase === 'attack') return this.targetId ? 'Kies units en bepaal hoe lang je doorvecht.' : this.sourceId ? 'Kies een oplichtend vijandelijk doel.' : 'Kies een eigen gebied met mobiele units.';
    if (state.phase === 'fortify') return state.fortifyUsed ? 'Fortificatie voltooid. Beëindig je beurt.' : this.sourceId ? 'Kies een verbonden eigen bestemming.' : 'Optioneel: verplaats één groep via eigen gebied.';
    return 'De campagne is beslist.';
  }

  private renderLog(): string {
    const entries = this.engine.state.log.slice(-8).reverse();
    return `
      <aside class="battle-log glass-panel ${this.logOpen ? 'is-open' : ''}">
        <button class="battle-log__toggle" data-action="toggle-log"><span>ACTIVITEIT</span><b>${this.logOpen ? '×' : '↑'}</b></button>
        <div class="battle-log__entries">${entries.map((entry) => `<p class="log-${entry.kind}"><span>${entry.turn}</span>${escapeHtml(entry.message)}</p>`).join('')}</div>
      </aside>
    `;
  }

  private renderIntro(): string {
    return `
      <div class="modal-backdrop">
        <section class="intro-card modal-card">
          <div class="intro-card__map"><div class="orb orb--one"></div><div class="orb orb--two"></div><span>EONSCAR NETWORK / 01</span><strong>RECLAIM<br>THE FUTURE</strong></div>
          <div class="intro-card__content">
            <div class="panel-kicker">SPEELBARE VERTICALE SLICE</div>
            <h1>Verover de wereld.<br><em>Zonder dobbelpech.</em></h1>
            <p>De klassieke territoriale beurtstructuur, met echte units en fictieve coalities die de culturele, religieuze en politieke diversiteit van 2026 weerspiegelen.</p>
            <div class="intro-features"><span><b>01</b> Versterk grensgebieden</span><span><b>02</b> Bouw een formatie</span><span><b>03</b> Breek de frontlinie</span></div>
            <button class="primary-button intro-start" data-action="close-intro">CAMPAGNE STARTEN <span>→</span></button>
            <small>Fictieve 2026-coalities · 1 speler · 3 strategische AI-facties · seed ${this.engine.state.seed}</small>
          </div>
        </section>
      </div>
    `;
  }

  private renderHelp(): string {
    return `
      <div class="modal-backdrop">
        <section class="modal-card help-card">
          <button class="modal-close" data-action="help">×</button>
          <div class="panel-kicker">VELDHANDBOEK</div>
          <h2>Drie fases. Eén wereld.</h2>
          <div class="help-grid">
            <article><span>1</span><h3>Versterken</h3><p>Je krijgt minimaal 3 punten, plus regiobonussen. Infanterie kost 1, Pantser 3 en Artillerie 2.</p></article>
            <article><span>2</span><h3>Aanvallen</h3><p>Kies bron en aangrenzend doel. De verdediger vuurt eerst. Schade is <code>max(1, ATK − DEF)</code>.</p></article>
            <article><span>3</span><h3>Fortificeren</h3><p>Verplaats eenmaal units tussen twee gebieden die via jouw grond verbonden zijn.</p></article>
          </div>
          <div class="unit-rule-table">${UNIT_ORDER.map((type) => { const unit = UNIT_DEFINITIONS[type]; return `<div><span class="unit-glyph unit-glyph--${type}">${unit.icon}</span><strong>${unit.name}</strong><b>${unit.maxHp} HP</b><b>${unit.attack} ATK</b><b>${unit.defense} DEF</b><small>${unit.description}</small></div>`; }).join('')}</div>
          <div class="country-codex">${this.engine.state.players.map((player) => `<article style="--country:${player.cssColor}"><div><span>${player.sigil}</span><strong>${escapeHtml(player.name)}</strong></div><small>${player.influences.map(escapeHtml).join(' · ')}</small><p>${escapeHtml(player.profile)}</p></article>`).join('')}</div>
          <p class="help-tip"><b>Formaties:</b> de twee units met de hoogste DEF vormen automatisch het front. De sterkste overgebleven unit ondersteunt. Reserves schuiven de volgende ronde door.</p>
        </section>
      </div>
    `;
  }

  private renderCards(): string {
    const player = this.engine.state.players.find((candidate) => candidate.isHuman)!;
    const set = findTradeSetIndices(player.cards);
    return `
      <div class="modal-backdrop modal-backdrop--soft" data-action="cards">
        <section class="modal-card cards-modal" data-stop-propagation>
          <button class="modal-close" data-action="cards">×</button>
          <div class="panel-kicker">GEBIEDSKAARTEN</div>
          <h2>Jouw hand · ${player.cards.length}</h2>
          <p>Verover minstens één gebied in je beurt om één kaart te trekken. Drie gelijke symbolen of één van elk vormen een set.</p>
          <div class="card-hand">${player.cards.length ? player.cards.map((card) => {
            const unit = UNIT_DEFINITIONS[card.symbol];
            return `<div class="territory-card territory-card--${card.symbol}"><span>${unit.icon}</span><small>${unit.shortName}</small><strong>${escapeHtml(TERRITORY_BY_ID[card.territoryId]?.name ?? '')}</strong></div>`;
          }).join('') : '<div class="empty-hand">Nog geen kaarten. Tijd om een gebied te veroveren.</div>'}</div>
          <div class="card-footer"><span>${set ? '✓ Geldige set beschikbaar' : 'Nog geen geldige set'}</span>${this.engine.state.phase === 'reinforce' && this.engine.activePlayer.isHuman && set ? '<button class="primary-button" data-action="trade-cards">Set inleveren</button>' : ''}</div>
        </section>
      </div>
    `;
  }

  private renderGameOver(): string {
    const winner = this.engine.state.players.find((player) => player.id === this.engine.state.winnerId);
    return `
      <div class="modal-backdrop">
        <section class="modal-card victory-card" style="--winner:${winner?.cssColor ?? '#ffffff'}">
          <div class="victory-sigil">${winner?.sigil ?? '·'}</div>
          <div class="panel-kicker">CAMPAGNE VOLTOOID</div>
          <h1>${escapeHtml(winner?.name ?? 'Onbekend')} wint</h1>
          <p>Alle dertig gebieden staan onder één bevel.</p>
          <button class="primary-button" data-action="new-game">Nieuwe campagne</button>
        </section>
      </div>
    `;
  }

  private bindActions(): void {
    this.hud.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => {
      element.addEventListener('click', (event) => {
        const action = element.dataset.action;
        if (action === 'cards' && (event.target as HTMLElement).closest('[data-stop-propagation]') && element.classList.contains('modal-backdrop')) return;
        switch (action) {
          case 'close-intro': this.introOpen = false; this.render(); void this.maybeRunAi(); break;
          case 'help': this.helpOpen = !this.helpOpen; this.render(); break;
          case 'cards': this.cardsOpen = !this.cardsOpen; this.render(); break;
          case 'toggle-log': this.logOpen = !this.logOpen; this.render(); break;
          case 'camera-reset': mapBridge.scene?.resetCamera(); break;
          case 'select-unit': this.selectedUnitType = element.dataset.type as UnitType; this.render(); break;
          case 'adjust-count': this.adjustCount(element.dataset.type as UnitType, Number(element.dataset.delta)); break;
          case 'clear-selection': this.clearSelection(); break;
          case 'attack-round': this.executeAttack(false); break;
          case 'attack-until': this.executeAttack(true); break;
          case 'fortify': this.executeFortify(); break;
          case 'advance-phase':
            if (!this.engine.advancePhase(this.engine.activePlayer.id)) this.toast('Rond eerst de huidige fase af.');
            this.clearSelection();
            break;
          case 'trade-cards':
            this.engine.tradeCards(this.engine.activePlayer.id);
            this.cardsOpen = false;
            this.render();
            break;
          case 'repair':
            if (this.inspectId && element.dataset.unitId) {
              if (!this.engine.repairUnit(this.engine.activePlayer.id, this.inspectId, element.dataset.unitId)) this.toast('Niet genoeg punten om deze unit te herstellen.');
            }
            break;
          case 'ai-speed': this.aiDelay = this.aiDelay > 200 ? 120 : 430; this.render(); break;
          case 'new-game': window.location.reload(); break;
        }
      });
    });
  }
}
