import { COUNTRIES, COUNTRY_BY_ID, REGION_BY_ID, TERRITORIES, TERRITORY_BY_ID, isSeaConnection, terrainForTerritory } from '../game/data/worldMap';
import { mapBridge, type WorldMapEngineContract } from '../game/map/bridge';
import {
  DEFENSIVE_POSITION_BONUS,
  WorldEngine,
  coalitionHp,
  forcePower,
  playerPerkForCountry,
  worldDateLabel,
} from '../sim/WorldEngine';
import {
  IMPROVEMENT_LABELS,
  MANAGEMENT_UPGRADE_BY_ID,
  MANAGEMENT_UPGRADES,
  RESEARCH_BY_ID,
  RESEARCH_PROJECTS,
} from '../sim/data/research';
import type {
  DiplomaticOffer,
  BattleEvent,
  ManagementDomain,
  ManagementUpgradeId,
  PeaceSettlementType,
  PlayerId,
  RelationState,
  SimTerritoryState,
  TerritoryId,
  TreatyType,
  WorldChange,
  WorldSpeed,
} from '../sim/types';

const RELATION_LABELS: Record<RelationState['status'], string> = {
  peace: 'Peace', tension: 'Tension', war: 'War', truce: 'Truce',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);
}

function format(value: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : ''}${format(value, 0)}`;
}

function populationLossLabel(millions: number): string {
  if (millions >= 1) return `${format(millions, 2)}M`;
  if (millions >= 0.001) return `${format(millions * 1_000, 1)}K`;
  return `${format(millions * 1_000_000)} people`;
}

export class WorldUI {
  private readonly hud: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly toastLayer: HTMLElement;
  private selectedTerritoryId?: TerritoryId;
  private diplomacyTargetId: PlayerId = '';
  private panelMode: 'war' | 'economy' | 'research' | 'diplomacy' | 'ranking' = 'war';
  private introOpen = true;
  private helpOpen = false;
  private inboxOpen = false;
  private confirmWarTargetId?: PlayerId;
  private eventFeedOpen = false;
  private contextPanelOpen = false;
  private introPreviewCountryId: TerritoryId = COUNTRY_BY_ID.usa ? 'usa' : COUNTRIES[0]!.id;
  private introSearchQuery = '';
  private introGridScrollTop = 0;
  private rankingScrollTop = 0;
  private readonly panelScrollTops = new Map<string, number>();
  private lastRankingRefreshAt = 0;
  private rankingCache?: ReturnType<WorldEngine['globalRanking']>;
  private lastRankingCalculationAt = 0;
  private unsubscribe?: () => void;
  private renderTimer?: number;
  private latestBattle?: BattleEvent;
  private battleTimer?: number;
  private lastBattleVisualAt = 0;
  private suppressMapUntil = 0;
  private deltaPlayerId?: PlayerId;
  private previousPopulation?: number;
  private previousManpower?: number;
  private populationWeeklyDelta = 0;
  private manpowerWeeklyDelta = 0;

  constructor(private readonly engine: WorldEngine) {
    this.hud = document.querySelector<HTMLElement>('#hud')!;
    this.tooltip = document.querySelector<HTMLElement>('#tooltip')!;
    this.toastLayer = document.querySelector<HTMLElement>('#toast-layer')!;
    this.diplomacyTargetId = TERRITORY_BY_ID[engine.state.humanPlayerId]?.neighbors[0]
      ?? engine.state.players.find((player) => player.id !== engine.state.humanPlayerId)?.id
      ?? '';
    // V1 is retained only as a legacy entry point; its renderer contract predates
    // V2's canonical army naming and is intentionally isolated at this boundary.
    mapBridge.engine = engine as unknown as WorldMapEngineContract;
    mapBridge.onTerritoryClick = (territoryId) => {
      if (performance.now() < this.suppressMapUntil) return;
      this.selectTerritory(territoryId);
    };
    mapBridge.onTerritoryHover = (territoryId, x, y) => this.showTooltip(territoryId, x, y);
    this.unsubscribe = engine.subscribe((_state, change) => this.onStateChange(change));
    window.addEventListener('keydown', this.onKeyDown);
    this.hud.addEventListener('pointerdown', this.onHudPointerDown, true);
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
    if (this.battleTimer !== undefined) window.clearTimeout(this.battleTimer);
    window.removeEventListener('keydown', this.onKeyDown);
    this.hud.removeEventListener('pointerdown', this.onHudPointerDown, true);
  }

  private readonly onHudPointerDown = (event: PointerEvent): void => {
    if ((event.target as HTMLElement | null)?.closest('.glass-panel, .modal-card, [data-action]')) {
      this.suppressMapUntil = performance.now() + 500;
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId) return;
    if (event.code === 'Space') {
      event.preventDefault();
      this.engine.setSpeed(this.engine.state.speed === 0 ? 1 : 0);
    } else if (event.key === '+' || event.key === '=') {
      const next = ({ 0: 1, 1: 2, 2: 2 } as Record<number, WorldSpeed>)[this.engine.state.speed]!;
      this.engine.setSpeed(next);
    } else if (event.key === '-') {
      const next = ({ 0: 0, 1: 0, 2: 1 } as Record<number, WorldSpeed>)[this.engine.state.speed]!;
      this.engine.setSpeed(next);
    } else if (event.key === 'Escape') {
      this.selectedTerritoryId = undefined;
      this.contextPanelOpen = false;
      this.updateMapSelection();
      this.render();
    }
  };

  private onStateChange(change: WorldChange): void {
    this.updateHeaderDeltas(change);
    if (change.reason === 'war-declared') {
      const war = [...this.engine.state.wars].reverse().find((candidate) => candidate.startedTick === this.engine.state.tick);
      const attacker = war ? this.engine.player(war.attackerId) : undefined;
      const defender = war ? this.engine.player(war.defenderId) : undefined;
      if (attacker && defender) this.toast(`WAR STARTED · ${attacker.shortName} vs ${defender.shortName}`, 'war');
    }
    if (change.reason === 'conquest' && change.battle?.conquered) {
      const defeated = this.engine.player(change.battle.defenderId);
      const victor = this.engine.player(change.battle.attackerId);
      if (defeated?.eliminated && victor) this.toast(`COUNTRY DEFEATED · ${defeated.shortName} absorbed by ${victor.shortName}`, 'conquest');
    }
    if (change.battle) {
      const now = performance.now();
      const involvesHuman = change.battle.attackerId === this.engine.state.humanPlayerId || change.battle.defenderId === this.engine.state.humanPlayerId;
      const involvesSelection = change.battle.sourceId === this.selectedTerritoryId || change.battle.targetId === this.selectedTerritoryId;
      if (involvesHuman || involvesSelection) {
        this.latestBattle = change.battle;
        mapBridge.scene?.playBattle(change.battle);
        this.lastBattleVisualAt = now;
        if (this.battleTimer !== undefined) window.clearTimeout(this.battleTimer);
        this.battleTimer = window.setTimeout(() => {
          this.latestBattle = undefined;
          this.battleTimer = undefined;
          this.render();
        }, 2600);
      } else if (change.battle.conquered && now - this.lastBattleVisualAt >= 1200) {
        mapBridge.scene?.playBattle(change.battle);
        this.lastBattleVisualAt = now;
      }
    }
    const highFrequency = change.reason === 'tick' || change.reason === 'battle' || change.reason === 'conquest';
    if (!highFrequency) {
      if (this.renderTimer !== undefined) window.clearTimeout(this.renderTimer);
      this.renderTimer = undefined;
      mapBridge.sync();
      this.render();
      return;
    }
    if (this.renderTimer !== undefined) return;
    const humanAtWar = this.engine.state.wars.some((war) => war.attackerId === this.engine.state.humanPlayerId || war.defenderId === this.engine.state.humanPlayerId);
    const refreshDelay = humanAtWar ? 620 : 1050;
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = undefined;
      mapBridge.sync();
      const rankingOpen = this.contextPanelOpen && this.panelMode === 'ranking';
      if (rankingOpen && performance.now() - this.lastRankingRefreshAt < 5_000) return;
      this.render();
    }, refreshDelay);
  }

  private updateHeaderDeltas(change: WorldChange): void {
    const playerId = this.engine.state.humanPlayerId;
    const player = this.engine.player(playerId);
    if (!player) return;
    const population = this.engine.controlledPopulation(playerId);
    if (this.deltaPlayerId !== playerId || this.previousPopulation === undefined || this.previousManpower === undefined || change.reason === 'country-selected') {
      this.deltaPlayerId = playerId;
      this.previousPopulation = population;
      this.previousManpower = player.manpower;
      this.populationWeeklyDelta = this.engine.weeklyPopulationTrend(playerId);
      this.manpowerWeeklyDelta = this.engine.weeklyManpowerTrend(playerId);
      return;
    }
    if (change.reason !== 'tick') return;
    this.populationWeeklyDelta = population - this.previousPopulation;
    this.manpowerWeeklyDelta = player.manpower - this.previousManpower;
    this.previousPopulation = population;
    this.previousManpower = player.manpower;
  }

  private selectTerritory(territoryId: TerritoryId): void {
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId) return;
    this.selectedTerritoryId = territoryId;
    this.contextPanelOpen = true;
    const owner = this.engine.state.territories[territoryId]?.ownerId;
    if (owner && owner !== this.engine.state.humanPlayerId) this.diplomacyTargetId = owner;
    this.updateMapSelection();
    this.render();
  }

  private updateMapSelection(): void {
    mapBridge.setSelection({ sourceId: this.selectedTerritoryId, legalTargetIds: [] });
  }

  private setPanel(mode: 'war' | 'economy' | 'research' | 'diplomacy' | 'ranking'): void {
    const sameCommandPanel = this.contextPanelOpen && !this.selectedTerritoryId && this.panelMode === mode;
    this.selectedTerritoryId = undefined;
    this.updateMapSelection();
    this.panelMode = mode;
    this.contextPanelOpen = !sameCommandPanel;
    this.render();
  }

  private ranking(force = false): ReturnType<WorldEngine['globalRanking']> {
    const now = performance.now();
    if (force || !this.rankingCache || now - this.lastRankingCalculationAt >= 5_000) {
      this.rankingCache = this.engine.globalRanking();
      this.lastRankingCalculationAt = now;
    }
    return this.rankingCache;
  }

  private showTooltip(territoryId: TerritoryId | undefined, x: number, y: number): void {
    if (!territoryId) {
      this.tooltip.classList.remove('is-visible');
      return;
    }
    const territory = this.engine.state.territories[territoryId];
    const definition = TERRITORY_BY_ID[territoryId];
    const owner = territory ? this.engine.player(territory.ownerId) : undefined;
    if (!territory || !definition || !owner) return;
    const power = this.engine.effectivePower(owner.id, territory.force);
    const warNeighbors = definition.neighbors.filter((neighborId) => {
      const neighborOwner = this.engine.state.territories[neighborId]?.ownerId;
      return neighborOwner && neighborOwner !== owner.id && this.engine.activeWarBetween(owner.id, neighborOwner);
    }).length;
    this.tooltip.innerHTML = `
      <div class="tooltip__eyebrow">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? '')}${warNeighbors ? ' · ACTIVE FRONT' : ''}</div>
      <strong>${escapeHtml(definition.name)}</strong>
      <span style="color:${owner.cssColor}">${escapeHtml(owner.name)}</span>
      <div class="tooltip__stats">
        POWER ${format(power)} · ATK ${format(this.engine.effectiveAttack(owner.id, territory.force), 1)} · DEF ${format(this.engine.effectiveDefense(owner.id, territory.force), 1)} · HP ${format(territory.force.hp)}/${format(territory.force.maxHp)}
      </div>
    `;
    this.tooltip.style.left = `${Math.min(window.innerWidth - 210, x + 16)}px`;
    this.tooltip.style.top = `${Math.min(window.innerHeight - 130, y + 14)}px`;
    this.tooltip.classList.add('is-visible');
  }

  private toast(message: string, tone: 'default' | 'war' | 'conquest' = 'default'): void {
    const element = document.createElement('div');
    element.className = `toast toast--${tone}`;
    element.textContent = message;
    this.toastLayer.append(element);
    window.setTimeout(() => element.classList.add('toast--show'), 15);
    window.setTimeout(() => {
      element.classList.remove('toast--show');
      window.setTimeout(() => element.remove(), 220);
    }, 2200);
  }

  private render(): void {
    const currentScrollablePanel = this.hud.querySelector<HTMLElement>('.command-drawer[data-scroll-key]');
    const currentScrollKey = currentScrollablePanel?.dataset.scrollKey;
    if (currentScrollablePanel && currentScrollKey) this.panelScrollTops.set(currentScrollKey, currentScrollablePanel.scrollTop);
    const currentRankingPanel = this.hud.querySelector<HTMLElement>('.ranking-panel');
    if (currentRankingPanel) this.rankingScrollTop = currentRankingPanel.scrollTop;
    const currentIntroGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (currentIntroGrid) this.introGridScrollTop = currentIntroGrid.scrollTop;
    const state = this.engine.state;
    const human = this.engine.player(state.humanPlayerId)!;
    const unread = state.events.filter((event) => event.unread).length;
    const pendingOffers = state.offers.filter((offer) => offer.toId === human.id && offer.status === 'pending');
    const activeOffer = pendingOffers[0];
    const totalHp = coalitionHp(state, human.id);
    const hpRatio = totalHp.max > 0 ? totalHp.current / totalHp.max : 0;
    const humanWars = state.wars.filter((war) => war.attackerId === human.id || war.defenderId === human.id);
    const weeklyNetCashflow = this.engine.weeklyNetCashflow(human.id);
    const ranking = this.ranking();
    const humanRank = Math.max(1, ranking.findIndex((entry) => entry.player.id === human.id) + 1);
    const worldLeader = ranking[0]?.player;
    const activeResearch = RESEARCH_BY_ID[human.research.activeId]!;
    const researchCost = this.engine.researchProjectCost(human.id, human.research.activeId) ?? activeResearch.cost;
    const researchProgress = Math.min(100, human.research.progress / researchCost * 100);
    const underAttack = this.latestBattle?.defenderId === human.id;
    const commandOpen = this.contextPanelOpen && !this.selectedTerritoryId;
    if (this.introOpen || this.helpOpen || this.inboxOpen || this.confirmWarTargetId || state.gameOver) this.tooltip.classList.remove('is-visible');

    this.hud.innerHTML = `
      <header class="situation-topbar command-topbar glass-panel">
        <div class="coalition-chip command-identity" style="--coalition:${human.cssColor}">
          <span>${human.sigil}</span><div class="coalition-chip__body"><small>YOUR EMPIRE</small><strong>${escapeHtml(human.name)}</strong><div class="empire-hp ${hpRatio < 0.35 ? 'is-critical' : ''}"><i><b style="width:${hpRatio * 100}%"></b></i><span>${format(hpRatio * 100)}% HP</span></div></div>
        </div>
        <div class="world-clock">
          <span class="world-date">${worldDateLabel(this.engine)}</span>
          <div class="speed-controls" aria-label="Simulation speed">
            ${([0, 1, 2] as WorldSpeed[]).map((speed) => `<button class="${state.speed === speed ? 'is-active' : ''}" data-action="speed" data-speed="${speed}" title="${speed === 0 ? 'Pause' : `${speed}× speed`}">${speed === 0 ? 'Ⅱ' : `${speed}×`}</button>`).join('')}
          </div>
          <b class="clock-state ${state.speed === 0 ? 'is-paused' : ''}">${state.speed === 0 ? 'PAUSED' : 'LIVE'}</b>
        </div>
        <div class="strategic-metrics">
          <div class="treasury-metric"><span>TREASURY</span><strong>${format(human.treasury, 1)}B</strong><small class="cashflow ${weeklyNetCashflow >= 0 ? 'is-positive' : 'is-negative'}">${weeklyNetCashflow >= 0 ? '+' : '−'}${format(Math.abs(weeklyNetCashflow), 2)}B / week</small></div>
          <button class="ranking-metric" data-action="ranking"><span>WORLD RANK</span><strong>#${humanRank} <small>${worldLeader ? `· ${escapeHtml(worldLeader.shortName)} #1` : ''}</small></strong></button>
          <div class="population-metric"><span>POPULATION</span><strong>${format(this.engine.controlledPopulation(human.id), 1)}M</strong><small class="weekly-delta ${this.populationWeeklyDelta >= 0 ? 'is-positive' : 'is-negative'}">${this.populationWeeklyDelta >= 0 ? '+' : '−'}${populationLossLabel(Math.abs(this.populationWeeklyDelta))} / week</small></div>
          <div class="manpower-metric"><span>MANPOWER</span><strong>${populationLossLabel(human.manpower)}</strong><small class="weekly-delta ${this.manpowerWeeklyDelta >= 0 ? 'is-positive' : 'is-negative'}">${this.manpowerWeeklyDelta >= 0 ? '+' : '−'}${populationLossLabel(Math.abs(this.manpowerWeeklyDelta))} / week</small></div>
        </div>
        <div class="top-actions">
          <button class="icon-button inbox-button ${unread ? 'has-alert' : ''}" data-action="inbox" title="Reports">⌁${unread ? `<i>${unread}</i>` : ''}</button>
          <button class="icon-button" data-action="camera-reset" title="Center map">⌖</button>
          <button class="icon-button" data-action="help" title="Help">?</button>
        </div>
      </header>

      <nav class="command-dock glass-panel" aria-label="Command center">
        <button class="${commandOpen && this.panelMode === 'war' ? 'is-active' : ''} ${humanWars.length ? 'has-war' : ''}" data-action="panel" data-panel="war"><i>⚔</i><span><b>WAR</b><small>${humanWars.length ? `${humanWars.length} active` : 'Forces'}</small></span></button>
        <button class="${commandOpen && this.panelMode === 'economy' ? 'is-active' : ''}" data-action="panel" data-panel="economy"><i>◫</i><span><b>FINANCE</b><small class="${weeklyNetCashflow < 0 ? 'expense-value' : ''}">${weeklyNetCashflow >= 0 ? '+' : '−'}${format(Math.abs(weeklyNetCashflow), 2)}B/w</small></span></button>
        <button class="${commandOpen && this.panelMode === 'research' ? 'is-active' : ''}" data-action="panel" data-panel="research"><i>⌬</i><span><b>RESEARCH</b><small>${format(researchProgress)}% · PASSIVE</small></span></button>
      </nav>

      ${humanWars.length ? this.renderWarTracker() : ''}
      ${underAttack && this.latestBattle ? this.renderAttackVignette(this.latestBattle) : ''}
      ${this.contextPanelOpen ? this.renderContextPanel() : ''}
      ${this.renderEventTicker()}
      ${activeOffer ? this.renderOfferBanner(activeOffer) : ''}
      ${this.introOpen ? this.renderIntro() : ''}
      ${this.helpOpen ? this.renderHelp() : ''}
      ${this.inboxOpen ? this.renderInbox() : ''}
      ${this.confirmWarTargetId ? this.renderWarConfirmation(this.confirmWarTargetId) : ''}
      ${state.gameOver ? this.renderGameOver() : ''}
    `;
    this.bindActions();
    const rankingPanel = this.hud.querySelector<HTMLElement>('.ranking-panel');
    if (rankingPanel) {
      rankingPanel.scrollTop = this.rankingScrollTop;
      this.lastRankingRefreshAt = performance.now();
    }
    const introGrid = this.hud.querySelector<HTMLElement>('.country-grid');
    if (introGrid) introGrid.scrollTop = this.introGridScrollTop;
    const nextScrollablePanel = this.hud.querySelector<HTMLElement>('.command-drawer[data-scroll-key]');
    const nextScrollKey = nextScrollablePanel?.dataset.scrollKey;
    if (nextScrollablePanel && nextScrollKey) nextScrollablePanel.scrollTop = this.panelScrollTops.get(nextScrollKey) ?? 0;
  }

  private renderContextPanel(): string {
    const territory = this.selectedTerritoryId ? this.engine.state.territories[this.selectedTerritoryId] : undefined;
    if (territory) return this.renderTerritoryPanel(territory);
    if (this.panelMode === 'ranking') return this.renderRankingPanel();
    if (this.panelMode === 'diplomacy') return this.renderDiplomacyPanel();
    if (this.panelMode === 'economy') return this.renderEconomyPanel();
    if (this.panelMode === 'research') return this.renderResearchPanel();
    return this.renderMilitaryPanel();
  }

  private renderRankingPanel(): string {
    const humanId = this.engine.state.humanPlayerId;
    const ranking = this.ranking();
    const humanRank = ranking.findIndex((entry) => entry.player.id === humanId) + 1;
    const humanEntry = ranking[humanRank - 1];
    return `
      <aside class="world-panel command-drawer glass-panel ranking-panel" data-scroll-key="ranking">
        <button class="panel-close" data-action="close-panel" aria-label="Close ranking">×</button>
        <div class="panel-kicker">GLOBAL POWER · LIVE</div>
        <h2>Your country is #${humanRank}</h2>
        <p>Territory, armed strength, economy, population and science decide your position.</p>
        <div class="ranking-podium"><div><span>WORLD LEADER</span><strong>${escapeHtml(ranking[0]?.player.name ?? '—')}</strong></div><div><span>YOUR POWER</span><strong>${format(humanEntry?.score ?? 0)}</strong></div></div>
        <div class="ranking-refresh-note">REFRESHES EVERY 5 SECONDS · WEEK ${this.engine.state.tick}</div>
        <div class="power-ranking">${ranking.map((entry) => {
          const rank = ranking.indexOf(entry) + 1;
          const territories = this.engine.territoriesOf(entry.player.id).length;
          return `<div class="${entry.player.id === humanId ? 'is-human' : ''} ${rank === 1 ? 'is-leader' : ''}" style="--power:${entry.player.cssColor}"><span>#${rank}</span><i>${entry.player.sigil}</i><div><strong>${escapeHtml(entry.player.name)}</strong><small>${territories} countr${territories === 1 ? 'y' : 'ies'} · ${populationLossLabel(entry.player.manpower)} trained</small></div><b>${format(entry.score)}</b></div>`;
        }).join('')}</div>
      </aside>
    `;
  }

  private renderEconomyPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const finance = this.engine.weeklyFinanceBreakdown(human.id);
    const protectedCash = finance.mode === 'war' || finance.mode === 'insolvent' ? 0 : finance.reserveTarget;
    const runway = finance.net < 0 ? Math.max(0, human.treasury - protectedCash) / Math.max(0.001, -finance.net) : Number.POSITIVE_INFINITY;
    const reserveHeading = finance.mode === 'normal' ? 'FULLY FUNDED'
      : finance.mode === 'conserving' ? `AUTO-OPTIMISING · SAVING $${format(finance.savings, 2)}B/W`
        : finance.mode === 'rebuilding' ? `REBUILDING RESERVE · TARGET $${format(finance.reserveTarget)}B`
          : finance.mode === 'war' ? 'WARTIME FUNDING · RESERVE RELEASED'
            : 'CASH EXHAUSTED · EMERGENCY RATIONING';
    const reserveCopy = finance.mode === 'normal'
      ? `The national account can fund every requested programme while keeping a $${format(finance.reserveTarget)}B operating buffer.`
      : finance.mode === 'conserving'
        ? `Finance directors are trimming new force expansion, training and part of defence upkeep before touching research or recovery. Requested $${format(finance.requestedExpenses, 2)}B; funded $${format(finance.expenses, 2)}B this week.`
        : finance.mode === 'rebuilding'
          ? `Spending is reduced until the account recovers toward $${format(finance.reserveTarget)}B. Every funded activity is still paid from treasury; reduced funding means slower training, research, repairs and readiness.`
          : finance.mode === 'war'
            ? 'Active war may use the entire account. Operations, payroll and repairs are funded at their real cost until cash runs out.'
            : 'Income cannot cover current obligations. Every programme is receiving only partial real funding and military readiness will deteriorate.';
    return `
      <aside class="world-panel command-drawer glass-panel" data-scroll-key="economy">
        <button class="panel-close" data-action="close-panel" aria-label="Close finance">×</button>
        <div class="panel-kicker">NATIONAL FINANCE</div>
        <div class="drawer-heading"><div><h2>$${format(human.treasury, 1)}B</h2><span>ONE NATIONAL ACCOUNT</span></div><strong class="${finance.net < 0 ? 'is-negative' : 'is-positive'}">${finance.net >= 0 ? '+' : '−'}$${format(Math.abs(finance.net), 2)}B / WEEK</strong></div>
        <div class="finance-summary"><div><span>WEEKLY INCOME</span><strong>+$${format(finance.revenue, 2)}B</strong></div><div><span>FUNDED SPENDING</span><strong>−$${format(finance.expenses, 2)}B</strong></div><div><span>${finance.net < 0 ? 'RESERVE RUNWAY' : 'RESERVE TREND'}</span><strong>${Number.isFinite(runway) ? `${format(runway)} weeks` : finance.net > 0 ? `+$${format(finance.net, 2)}B/w` : 'STABLE'}</strong></div></div>
        <span class="section-label">CASHFLOW BREAKDOWN</span>
        <div class="finance-ledger">
          ${this.renderFinanceRow('Public revenue', finance.revenue, finance.revenue, true)}
          ${this.renderFinanceRow('Military payroll', finance.payroll, finance.revenue, false, finance.requestedPayroll)}
          ${this.renderFinanceRow('Force maintenance', finance.maintenance, finance.revenue, false, finance.requestedMaintenance)}
          ${this.renderFinanceRow('War operations', finance.warOperations, finance.revenue, false, finance.requestedWarOperations)}
          ${this.renderFinanceRow('Passive research', finance.research, finance.revenue, false, finance.requestedResearch)}
          ${this.renderFinanceRow('Manpower training', finance.training, finance.revenue, false, finance.requestedTraining)}
          ${this.renderFinanceRow('Force recovery', finance.recovery, finance.revenue, false, finance.requestedRecovery)}
          ${this.renderFinanceRow('Force expansion', finance.forceExpansion, finance.revenue, false, finance.requestedForceExpansion)}
        </div>
        <div class="reserve-note is-${finance.mode}"><b>${reserveHeading}</b><span>${reserveCopy}</span></div>
        ${this.renderManagementProgramme('finance')}
        ${this.renderUpgradeCatalog('finance')}
      </aside>
    `;
  }

  private renderFinanceRow(label: string, value: number, revenue: number, positive = false, requested = value): string {
    const share = Math.min(100, value / Math.max(0.001, revenue) * 100);
    const funding = requested > 0 ? Math.min(100, value / requested * 100) : 100;
    return `<div class="finance-row ${positive ? 'is-income' : ''} ${!positive && funding < 99.5 ? 'is-reduced' : ''}"><div><span>${label}${!positive && requested > 0 && funding < 99.5 ? ` · ${format(funding)}% funded` : ''}</span><strong>${positive ? '+' : '−'}$${format(value, 3)}B</strong></div><i><b style="width:${share}%"></b></i></div>`;
  }

  private renderResearchPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const active = RESEARCH_BY_ID[human.research.activeId]!;
    const effectiveCost = this.engine.researchProjectCost(human.id, human.research.activeId) ?? active.cost;
    const progress = active ? Math.min(100, (human.research.progress / effectiveCost) * 100) : 0;
    const discoveryLevel = human.research.discoveries[active.id] ?? 0;
    const totalDiscoveries = Object.values(human.research.discoveries).reduce((sum, level) => sum + level, 0);
    const weeklyCost = this.engine.weeklyResearchInvestment(human.id);
    return `
      <aside class="world-panel command-drawer glass-panel" data-scroll-key="research">
        <button class="panel-close" data-action="close-panel" aria-label="Close research">×</button>
        <div class="panel-kicker">NATIONAL RESEARCH LAB</div>
        <div class="drawer-heading"><div><h2>${escapeHtml(active.name)}</h2><span>RANDOM PASSIVE DISCOVERY · LEVEL ${discoveryLevel}</span></div><strong class="passive-badge">AUTONOMOUS</strong></div>
        <p>${escapeHtml(active.description)}</p>
        <div class="research-progress" style="--research:${active.color}"><div><span>PASSIVE PROGRESS</span><strong>${format(progress)}%</strong></div><i><b style="width:${progress}%"></b></i><small>${format(human.research.progress, 1)} / ${format(effectiveCost, 1)} RP · $${format(weeklyCost, 3)}B every week · next effect ${escapeHtml(active.effect)}</small></div>
        <div class="research-stats"><div><span>Science output</span><strong>${format(human.science, 1)}</strong></div><div><span>Total breakthroughs</span><strong>${totalDiscoveries}</strong></div></div>
        <span class="section-label">DISCOVERY HISTORY · NEXT BRANCH IS RANDOM</span>
        <div class="research-list">${RESEARCH_PROJECTS.map((project) => {
          const level = human.research.discoveries[project.id] ?? 0;
          const isActive = human.research.activeId === project.id;
          return `<div class="research-option ${isActive ? 'is-active' : ''}" style="--project:${project.color}"><i></i><div><strong>${escapeHtml(project.name)}</strong><small>${escapeHtml(project.field)} · ${escapeHtml(project.effect)}</small></div><span>${isActive ? 'DISCOVERING' : `LV ${level}`}</span></div>`;
        }).join('')}</div>
        ${this.renderManagementProgramme('research')}
        ${this.renderUpgradeCatalog('research')}
      </aside>
    `;
  }

  private renderManagementProgramme(domain: ManagementDomain): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const project = human.management[domain];
    if (!project.activeId) return `<div class="management-empty"><span>${domain.toUpperCase()} PROJECT SLOT</span><strong>No project active</strong><small>Choose one upgrade below. The full price is committed when development starts.</small></div>`;
    const upgrade = MANAGEMENT_UPGRADE_BY_ID[project.activeId]!;
    const progress = Math.min(100, project.progress / Math.max(1, project.target) * 100);
    const weeks = Math.max(0, Math.ceil(project.target - project.progress));
    return `<div class="management-active" style="--project:${upgrade.color}"><div class="management-active__head"><i>${upgrade.icon}</i><div><span>ACTIVE ${domain.toUpperCase()} PROJECT</span><strong>${escapeHtml(upgrade.name)}</strong></div><b>${format(progress)}%</b></div><div class="management-progress"><i><b style="width:${progress}%"></b></i><small>${weeks} weeks remaining · $${format(project.paidCost, 1)}B committed</small></div></div>`;
  }

  private renderUpgradeCatalog(domain: ManagementDomain): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const slotBusy = Boolean(human.management[domain].activeId);
    const upgrades = MANAGEMENT_UPGRADES.filter((upgrade) => upgrade.domain === domain);
    return `<span class="section-label">${domain === 'finance' ? 'FINANCIAL MODERNIZATION' : domain === 'war' ? 'COMMAND UPGRADES' : 'PAID R&D PROGRAMMES'}</span><div class="management-catalog">${upgrades.map((upgrade) => {
      const level = human.managementLevels[upgrade.id];
      const cost = this.engine.managementUpgradeCost(human.id, upgrade.id) ?? 0;
      const duration = this.engine.managementUpgradeDuration(human.id, upgrade.id) ?? 0;
      const maxed = level >= upgrade.maxLevel;
      const disabled = slotBusy || maxed || human.treasury < cost;
      return `<button style="--project:${upgrade.color}" data-action="start-upgrade" data-upgrade="${upgrade.id}" ${disabled ? 'disabled' : ''}><i>${upgrade.icon}</i><div><span>${escapeHtml(upgrade.branch)} · LEVEL ${level}</span><strong>${escapeHtml(upgrade.name)}</strong><small>${escapeHtml(upgrade.outcome)}</small><em>${maxed ? 'MAXIMUM LEVEL' : `$${format(cost, 1)}B · ${duration} WEEKS`}</em></div></button>`;
    }).join('')}</div>`;
  }

  private renderDiplomacyPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const relevantIds = new Set<PlayerId>();
    for (const territory of this.engine.territoriesOf(human.id)) {
      for (const neighborId of TERRITORY_BY_ID[territory.id]?.neighbors ?? []) {
        const ownerId = this.engine.state.territories[neighborId]?.ownerId;
        if (ownerId && ownerId !== human.id) relevantIds.add(ownerId);
      }
    }
    for (const war of this.engine.state.wars) {
      if (war.attackerId === human.id) relevantIds.add(war.defenderId);
      if (war.defenderId === human.id) relevantIds.add(war.attackerId);
    }
    if (this.diplomacyTargetId) relevantIds.add(this.diplomacyTargetId);
    const others = this.engine.state.players.filter((player) => relevantIds.has(player.id) && !player.eliminated)
      .sort((left, right) => (this.engine.relation(human.id, left.id)?.score ?? 0) - (this.engine.relation(human.id, right.id)?.score ?? 0))
      .slice(0, 24);
    const target = this.engine.player(this.diplomacyTargetId) ?? others[0]
      ?? this.engine.state.players.find((player) => player.id !== human.id && !player.eliminated)!;
    const relation = this.engine.relation(human.id, target.id)!;
    const atWar = relation.status === 'war';
    const activeWar = atWar ? this.engine.activeWarBetween(human.id, target.id) : undefined;
    const peaceTerms = activeWar ? this.engine.peaceProposalTerms(activeWar.id, human.id) : undefined;
    const canDeclareWar = this.engine.canDeclareWar(human.id, target.id);
    const warActionLabel = relation.status === 'truce' ? 'Truce active' : 'Declare war';
    return `
      <aside class="world-panel command-drawer glass-panel diplomacy-panel" data-scroll-key="diplomacy">
        <button class="panel-close" data-action="close-panel" aria-label="Close relations">×</button>
        <div class="panel-kicker">BORDER CONTACTS</div>
        <h2>Neighbours & enemies</h2>
        <div class="diplomacy-tabs">${others.map((player) => {
          const item = this.engine.relation(human.id, player.id)!;
          return `<button class="${target.id === player.id ? 'is-active' : ''}" style="--faction:${player.cssColor}" data-action="diplomacy-target" data-player="${player.id}"><i>${player.sigil}</i><div><strong>${escapeHtml(player.shortName)}</strong><small>${RELATION_LABELS[item.status]} · ${signed(item.score)}</small></div></button>`;
        }).join('')}</div>
        <div class="relation-card" style="--faction:${target.cssColor}">
          <div class="relation-card__head"><div class="relation-sigil">${target.sigil}</div><div><span>${RELATION_LABELS[relation.status].toUpperCase()}</span><h3>${escapeHtml(target.name)}</h3></div><strong class="relation-score ${relation.score < -20 ? 'is-hostile' : relation.score > 20 ? 'is-friendly' : ''}">${signed(relation.score)}</strong></div>
          <div class="relation-meters"><div><span>Trust</span><i><b style="width:${relation.trust}%"></b></i><strong>${format(relation.trust)}</strong></div><div><span>Grievances</span><i><b class="is-danger" style="width:${Math.min(100, relation.grievances)}%"></b></i><strong>${format(relation.grievances)}</strong></div></div>
        </div>
        <span class="section-label">ACTIONS · INFLUENCE ${format(human.influence)}</span>
        <div class="diplomacy-actions">
          <button data-action="improve-relations">Open dialogue <small>−8 influence</small></button>
          ${atWar ? peaceTerms?.eligible ? `
            <button class="is-peace" data-action="peace-settlement" data-player="${target.id}" data-settlement="reparations" ${peaceTerms.reparationsAvailable ? '' : 'disabled'}>Request peace · reparations <small>Pay $${format(peaceTerms.cashAmount, 1)}B</small></button>
            <button class="is-peace" data-action="peace-settlement" data-player="${target.id}" data-settlement="territory" ${peaceTerms.territoryId ? '' : 'disabled'}>Request peace · concede land <small>${peaceTerms.territoryId ? `${format(peaceTerms.controlShare * 100)}% of ${escapeHtml(TERRITORY_BY_ID[peaceTerms.territoryId]?.name ?? 'border region')}` : 'No viable border region'}</small></button>
          ` : `<button class="is-peace" disabled>Peace unavailable <small>${escapeHtml(peaceTerms?.reason ?? 'Full war continues')}</small></button>` : `
            <button class="is-danger" data-action="confirm-war" ${canDeclareWar ? '' : 'disabled'}>${warActionLabel}</button>
          `}
        </div>
      </aside>
    `;
  }

  private renderMilitaryPanel(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const territories = this.engine.territoriesOf(human.id);
    const hp = coalitionHp(this.engine.state, human.id);
    const power = territories.reduce((sum, territory) => sum + this.engine.effectivePower(human.id, territory.force), 0);
    const attack = territories.reduce((sum, territory) => sum + this.engine.effectiveAttack(human.id, territory.force), 0);
    const defense = territories.reduce((sum, territory) => sum + this.engine.effectiveDefense(human.id, territory.force), 0);
    const humanWars = this.engine.state.wars.filter((war) => war.attackerId === human.id || war.defenderId === human.id);
    return `
      <aside class="world-panel command-drawer glass-panel" data-scroll-key="war">
        <button class="panel-close" data-action="close-panel" aria-label="Close war command">×</button>
        <div class="panel-kicker">WAR COMMAND CENTER</div>
        <div class="drawer-heading"><div><h2>${humanWars.length ? `${humanWars.length} active front${humanWars.length > 1 ? 's' : ''}` : 'Forces ready'}</h2><span>AUTOMATED FRONT DISTRIBUTION</span></div><strong class="${humanWars.length ? 'is-negative' : 'is-positive'}">${humanWars.length ? 'AT WAR' : 'PEACETIME'}</strong></div>
        <div class="army-summary"><div><span>Total HP</span><strong>${format(hp.current)}/${format(hp.max)}</strong></div><div><span>POWER</span><strong>${format(power)}</strong></div><div><span>ATK</span><strong>${format(attack)}</strong></div><div><span>DEF</span><strong>${format(defense)}</strong></div></div>
        <div class="manpower-status"><div><span>TRAINED MANPOWER</span><strong>${populationLossLabel(human.manpower)} / ${populationLossLabel(this.engine.manpowerCapacity(human.id))}</strong></div><i><b style="width:${Math.min(100, human.manpower / Math.max(0.001, this.engine.manpowerCapacity(human.id)) * 100)}%"></b></i><small>Combat kills personnel. Your national account pays to train ${populationLossLabel(this.engine.manpowerTrainingRate(human.id))} replacements per week.</small></div>
        <div class="command-bonuses"><span>${IMPROVEMENT_LABELS.attack}<b>LV ${human.improvements.attack}</b></span><span>${IMPROVEMENT_LABELS.defense}<b>LV ${human.improvements.defense}</b></span><span>${IMPROVEMENT_LABELS.recovery}<b>LV ${human.improvements.recovery}</b></span><span>${IMPROVEMENT_LABELS.training}<b>LV ${human.improvements.training}</b></span></div>
        <span class="section-label">WAR SITUATION</span>
        <div class="war-list">${humanWars.length ? humanWars.map((war) => {
          const enemyId = war.attackerId === human.id ? war.defenderId : war.attackerId;
          const enemy = this.engine.player(enemyId)!;
          const score = war.attackerId === human.id ? war.warScore : -war.warScore;
          const ownMilitaryLoss = war.attackerId === human.id ? war.attackerMilitaryLoss : war.defenderMilitaryLoss;
          const enemyMilitaryLoss = war.attackerId === human.id ? war.defenderMilitaryLoss : war.attackerMilitaryLoss;
          const operation = this.engine.warOperation(war.id, human.id);
          const objective = operation ? `${TERRITORY_BY_ID[operation.sourceId]?.name ?? operation.sourceId} → ${TERRITORY_BY_ID[operation.targetId]?.name ?? operation.targetId}` : 'High command assessing the front';
          return `<article style="--enemy:${enemy.cssColor}"><div><i>${enemy.sigil}</i><div><strong>${escapeHtml(enemy.name)}</strong><small>Week ${this.engine.state.tick - war.startedTick} · ${war.battles} battle phases</small></div><b class="${score < 0 ? 'danger-text' : ''}">${signed(score)}</b></div><span>Our military casualties ${populationLossLabel(ownMilitaryLoss)} · enemy ${populationLossLabel(enemyMilitaryLoss)}</span><div class="war-list__operation"><b>${operation ? operation.doctrine.replaceAll('-', ' ').toUpperCase() : 'PLANNING'}</b><strong>${escapeHtml(objective)}</strong><small>${operation ? `${format(operation.supply * 100)}% supplied · ${operation.supportingForces} supporting front${operation.supportingForces === 1 ? '' : 's'} · momentum ${signed(Math.round(operation.momentum))}` : 'Reserves are moving toward threatened borders'}</small></div></article>`;
        }).join('') : '<div class="empty-state">No active war. Hostile borders still attract defensive reserves.</div>'}</div>
        ${this.renderManagementProgramme('war')}
        ${this.renderUpgradeCatalog('war')}
      </aside>
    `;
  }

  private renderTerritoryPanel(territory: SimTerritoryState): string {
    const definition = TERRITORY_BY_ID[territory.id]!;
    const country = COUNTRY_BY_ID[territory.id]!;
    const owner = this.engine.player(territory.ownerId)!;
    const humanId = this.engine.state.humanPlayerId;
    const hpRatio = territory.force.maxHp > 0 ? territory.force.hp / territory.force.maxHp : 0;
    const absorbed = territory.ownerId !== territory.id;
    const localPower = this.engine.effectivePower(owner.id, territory.force);
    const terrain = terrainForTerritory(territory.id);
    const terrainLabel = terrain.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const borderWars = definition.neighbors
      .map((neighborId) => this.engine.state.territories[neighborId]?.ownerId)
      .filter((ownerId): ownerId is PlayerId => Boolean(ownerId && ownerId !== territory.ownerId && this.engine.activeWarBetween(territory.ownerId, ownerId)));
    const activeHumanWar = owner.id !== humanId ? this.engine.activeWarBetween(humanId, owner.id) : undefined;
    const canQuickWar = owner.id !== humanId && this.engine.canDeclareWar(humanId, owner.id);
    const foreignController = territory.foreignControl ? this.engine.player(territory.foreignControl.controllerId) : undefined;
    const accessType = owner.id !== humanId ? this.engine.warAccessType(humanId, owner.id) : 'none';
    return `
      <aside class="world-panel command-drawer glass-panel territory-inspector" data-scroll-key="territory:${territory.id}">
        <button class="panel-close" data-action="clear-territory">×</button>
        <div class="panel-kicker">${escapeHtml(REGION_BY_ID[definition.regionId]?.name ?? '')}${territory.capital ? ' · CAPITAL TERRITORY' : ''}</div>
        <div class="territory-heading"><div><h2>${escapeHtml(absorbed ? `${definition.name} region` : definition.name)}</h2><span style="color:${owner.cssColor}">${escapeHtml(owner.name)}${absorbed ? ' · ABSORBED INTO THE EMPIRE' : ''}</span></div><i style="--owner:${owner.cssColor}">${owner.sigil}</i></div>
        ${borderWars.length ? '<div class="front-alert">⚠ ACTIVE FRONT ON THIS BORDER</div>' : ''}
        ${foreignController && territory.foreignControl ? `<div class="foreign-control-alert" style="--controller:${foreignController.cssColor}"><strong>${format(territory.foreignControl.share * 100)}% UNDER ${escapeHtml(foreignController.shortName).toUpperCase()} CONTROL</strong><span>${format(territory.population * territory.foreignControl.share, 2)}M people and part of local output are controlled across the moving front.</span><i><b style="width:${territory.foreignControl.share * 100}%"></b></i></div>` : ''}
        ${absorbed && hpRatio < 0.45 ? '<div class="occupation-alert">NEWLY ABSORBED REGION · SEVERELY DEPLETED · RECOVERING SLOWLY</div>' : ''}
        <div class="territory-kpis"><div><span>Population</span><strong>${format(territory.population, territory.population < 10 ? 1 : 0)}M</strong></div><div><span>GDP</span><strong>$${format(country.gdp)}B</strong></div><div><span>Local power</span><strong>${format(localPower)}</strong></div><div><span>Force readiness</span><strong>${format(territory.force.readiness * 100)}%</strong></div></div>
        <span class="section-label">NATIONAL FORCE · ${format(territory.force.hp)}/${format(territory.force.maxHp)} HP</span>
        <div class="force-health"><i><b style="width:${hpRatio * 100}%;background:${hpRatio < 0.3 ? '#ff655f' : owner.cssColor}"></b></i><span>${format(hpRatio * 100)}% combat strength</span></div>
        <details class="intel-details"><summary>More intelligence</summary><div class="territory-bar"><div><span>Terrain</span><strong>${terrainLabel}</strong></div><i><b style="width:${Math.min(100, 30 + territory.fortification * 22)}%;background:#f0bd68"></b></i></div><div class="territory-bar"><div><span>Stability</span><strong>${format(territory.stability)}%</strong></div><i><b style="width:${territory.stability}%;background:${owner.cssColor}"></b></i></div><div class="territory-bar"><div><span>Infrastructure</span><strong>${territory.infrastructure}/7</strong></div><i><b style="width:${(territory.infrastructure / 7) * 100}%;background:#62dfaf"></b></i></div><div class="force-overview"><div><span>ATK</span><strong>${format(this.engine.effectiveAttack(owner.id, territory.force), 1)}</strong></div><div><span>DEF</span><strong>${format(this.engine.effectiveDefense(owner.id, territory.force), 1)}</strong></div><div><span>RECOVERY</span><strong>+${format(this.engine.effectiveRecovery(owner.id, territory.force), 2)} HP/w</strong></div></div><p class="data-vintage">Population ${country.populationYear} · growth ${country.populationGrowthYear}: ${country.populationGrowthRate >= 0 ? '+' : ''}${format(country.populationGrowthRate, 2)}% · GDP ${country.gdpYear} · defence ${country.militaryYear}</p></details>
        ${owner.id !== humanId ? `<div class="territory-actions"><button class="danger-button" data-action="quick-war" data-player="${owner.id}" ${canQuickWar ? '' : 'disabled'}>${activeHumanWar ? 'WAR ALREADY ACTIVE' : canQuickWar ? `DECLARE ${accessType === 'naval' ? 'NAVAL ' : ''}WAR ON ${escapeHtml(owner.shortName).toUpperCase()}` : 'WAR UNAVAILABLE · NO OPEN FRONT'}</button><button class="secondary-button" data-action="open-owner-diplomacy" data-player="${owner.id}">Relations</button></div>` : ''}
      </aside>
    `;
  }

  private renderWarTracker(): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const wars = this.engine.state.wars.filter((war) => war.attackerId === human.id || war.defenderId === human.id);
    if (wars.length === 0) return '';
    return `<aside class="war-tracker glass-panel ${this.latestBattle?.defenderId === human.id ? 'is-under-attack' : ''}">
      <div class="war-tracker__title"><span><i></i> LIVE WAR COMMAND</span><b>${wars.length} ACTIVE FRONT${wars.length > 1 ? 'S' : ''}</b></div>
      <div class="war-tracker__wars">${wars.map((war) => {
        const enemyId = war.attackerId === human.id ? war.defenderId : war.attackerId;
        const enemy = this.engine.player(enemyId)!;
        const ownHp = coalitionHp(this.engine.state, human.id);
        const enemyHp = coalitionHp(this.engine.state, enemyId);
        const ownRatio = ownHp.max > 0 ? ownHp.current / ownHp.max : 0;
        const enemyRatio = enemyHp.max > 0 ? enemyHp.current / enemyHp.max : 0;
        const score = war.attackerId === human.id ? war.warScore : -war.warScore;
        const liveBattle = this.latestBattle?.warId === war.id ? this.latestBattle : undefined;
        const focusId = liveBattle?.targetId ?? enemy.capitalId;
        const status = liveBattle
          ? liveBattle.defenderId === human.id ? '⚠ ENEMY ASSAULT' : liveBattle.attackerId === human.id ? '↗ OUR OFFENSIVE' : 'FRONT ENGAGED'
          : 'FORCES MOBILISING';
        const location = liveBattle ? TERRITORY_BY_ID[liveBattle.targetId]?.name : undefined;
        const duration = this.engine.state.tick - war.startedTick;
        const phase = duration < 26 ? 'OPENING FRONTS' : duration < 78 ? 'WAR OF ATTRITION' : 'COLLAPSE PHASE';
        const ownOperation = this.engine.warOperation(war.id, human.id);
        const enemyOperation = this.engine.warOperation(war.id, enemyId);
        const activeOperation = liveBattle?.attackerId === human.id ? ownOperation : liveBattle?.attackerId === enemyId ? enemyOperation : ownOperation;
        const operationSource = activeOperation ? TERRITORY_BY_ID[activeOperation.sourceId]?.name ?? activeOperation.sourceId : undefined;
        const operationTarget = activeOperation ? TERRITORY_BY_ID[activeOperation.targetId]?.name ?? activeOperation.targetId : undefined;
        const peaceTerms = this.engine.peaceProposalTerms(war.id, human.id);
        const disputed = Object.values(this.engine.state.territories).filter((territory) => (
          territory.foreignControl
          && ((territory.ownerId === human.id && territory.foreignControl.controllerId === enemyId)
            || (territory.ownerId === enemyId && territory.foreignControl.controllerId === human.id))
        ));
        const ownControl = disputed.filter((territory) => territory.foreignControl?.controllerId === human.id)
          .reduce((sum, territory) => sum + (territory.foreignControl?.share ?? 0), 0);
        const enemyControl = disputed.filter((territory) => territory.foreignControl?.controllerId === enemyId)
          .reduce((sum, territory) => sum + (territory.foreignControl?.share ?? 0), 0);
        return `<article class="war-tracker__war ${liveBattle?.defenderId === human.id ? 'is-defending' : ''}"><button class="war-tracker__focus" data-action="focus-war" data-territory="${focusId}">
          <div class="war-tracker__enemy" style="--enemy:${enemy.cssColor}"><i>${enemy.sigil}</i><div><span>${status}</span><strong>${escapeHtml(human.shortName)} <em>vs</em> ${escapeHtml(enemy.shortName)}</strong><small>Week ${this.engine.state.tick - war.startedTick} · ${war.battles} phases${location ? ` · ${escapeHtml(location)}` : ''}</small></div><b class="${score < 0 ? 'danger-text' : ''}">${signed(score)}</b></div>
          ${activeOperation ? `<div class="war-tracker__operation ${liveBattle?.attackerId === human.id ? 'is-ours' : 'is-enemy'}"><div><span>${liveBattle?.attackerId === human.id ? 'OUR OPERATION' : 'ENEMY OPERATION'} · ${activeOperation.doctrine.replaceAll('-', ' ').toUpperCase()}</span><strong>${escapeHtml(operationSource ?? '')} <i>→</i> ${escapeHtml(operationTarget ?? '')}</strong></div><div><span>SUPPLY <b>${format(activeOperation.supply * 100)}%</b></span><span>SUPPORT <b>${activeOperation.supportingForces}</b></span><span>MOMENTUM <b>${signed(Math.round(activeOperation.momentum))}</b></span></div></div>` : ''}
          <div class="war-tracker__health"><div><span>OUR HP</span><strong>${format(ownHp.current)} / ${format(ownHp.max)}</strong><i><b style="width:${ownRatio * 100}%;background:${human.cssColor}"></b></i></div><em>WAR SCORE</em><div><span>ENEMY HP</span><strong>${format(enemyHp.current)} / ${format(enemyHp.max)}</strong><i><b style="width:${enemyRatio * 100}%;background:${enemy.cssColor}"></b></i></div></div>
          ${disputed.length ? `<div class="war-tracker__control"><span>${phase}</span><strong>OUR CONTROL +${format(ownControl * 100)}% · ENEMY +${format(enemyControl * 100)}%</strong><i><b style="width:${Math.min(100, Math.max(3, ownControl * 100))}%"></b></i></div>` : `<div class="war-tracker__phase"><span>${phase}</span><strong>Front lines holding</strong></div>`}
        </button>${peaceTerms.eligible ? `<div class="war-tracker__diplomacy"><div><span>LOSING-SIDE DECISION</span><strong>You are clearly behind. Continue the full war or request a negotiated exit.</strong></div><button data-action="peace-settlement" data-player="${enemy.id}" data-settlement="reparations" ${peaceTerms.reparationsAvailable ? '' : 'disabled'}>PAY $${format(peaceTerms.cashAmount, 1)}B</button><button data-action="peace-settlement" data-player="${enemy.id}" data-settlement="territory" ${peaceTerms.territoryId ? '' : 'disabled'}>CONCEDE LAND</button></div>` : ''}</article>`;
      }).join('')}</div>
    </aside>`;
  }

  private renderAttackVignette(battle: BattleEvent): string {
    const attacker = this.engine.player(battle.attackerId)!;
    const location = TERRITORY_BY_ID[battle.targetId]?.name ?? 'your territory';
    const movement = battle.controlGained > 0.001 ? `front +${format(battle.controlGained * 100, 1)}%`
      : battle.controlGained < -0.001 ? `front repelled ${format(Math.abs(battle.controlGained) * 100, 1)}%` : 'line held';
    return `<div class="attack-vignette ${battle.conquered ? 'is-lost' : ''}" aria-live="assertive"><div><span>${battle.conquered ? 'TERRITORY LOST' : `ENEMY ${battle.operation.replaceAll('-', ' ').toUpperCase()}`}</span><strong>${escapeHtml(attacker.shortName)} operating toward ${escapeHtml(location)}</strong><b>−${format(battle.attackerDamageDealt, 1)} HP · ${movement} · ${format(battle.attackerSupply * 100)}% supplied</b></div></div>`;
  }

  private renderEventTicker(): string {
    const events = this.engine.state.events.slice(-8).reverse();
    const latest = events[0];
    return `
      <aside class="world-feed glass-panel ${this.eventFeedOpen ? 'is-open' : ''}">
        <button class="world-feed__head" data-action="toggle-feed"><span><b class="event-dot event-dot--${latest?.severity ?? 'info'}"></b> REPORT</span><strong>${latest ? escapeHtml(latest.message) : 'No reports'}</strong><i>${this.eventFeedOpen ? '×' : '↑'}</i></button>
        <div class="world-feed__list">${events.map((event) => `<button data-action="focus-event" data-territory="${event.territoryId ?? ''}"><span>W${event.tick}</span><b class="event-dot event-dot--${event.severity}"></b><p>${escapeHtml(event.message)}</p></button>`).join('')}</div>
      </aside>
    `;
  }

  private renderOfferBanner(offer: DiplomaticOffer): string {
    const from = this.engine.player(offer.fromId)!;
    const terms = offer.settlement === 'territory'
      ? `LAND OFFER · ${format((offer.controlShare ?? 0) * 100)}% OF ${escapeHtml(TERRITORY_BY_ID[offer.territoryId ?? '']?.name ?? 'BORDER REGION').toUpperCase()}`
      : `REPARATIONS · $${format(offer.cashAmount ?? 0, 1)}B`;
    return `
      <div class="decision-banner glass-panel" style="--sender:${from.cssColor}">
        <i>${from.sigil}</i><div><span>LOSING SIDE REQUESTS PEACE · ${terms}</span><strong>${escapeHtml(offer.note)}</strong></div>
        <button class="ghost-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="false">Continue full war</button>
        <button class="primary-button" data-action="respond-offer" data-offer="${offer.id}" data-accept="true">Accept settlement</button>
      </div>
    `;
  }

  private renderIntro(): string {
    const countries = [...COUNTRIES].sort((left, right) => right.powerIndex - left.powerIndex || left.englishName.localeCompare(right.englishName, 'en'));
    const previewCountry = COUNTRY_BY_ID[this.introPreviewCountryId] ?? countries[0]!;
    const previewPlayer = this.engine.player(previewCountry.id)!;
    const previewTerritory = this.engine.state.territories[previewCountry.id]!;
    const previewPerk = playerPerkForCountry(previewCountry.id);
    const previewDefinition = TERRITORY_BY_ID[previewCountry.id]!;
    const previewRank = countries.findIndex((country) => country.id === previewCountry.id) + 1;
    const seaRoutes = previewDefinition.seaNeighbors.length;
    const landRoutes = previewDefinition.neighbors.length - seaRoutes;
    const query = this.introSearchQuery.trim().toLocaleLowerCase('en');
    return `
      <div class="modal-backdrop">
        <section class="country-select modal-card">
          <div class="country-select__head">
            <div><div class="panel-kicker">NEW CAMPAIGN · 2026</div><h1>Choose your country</h1><p>Every country begins with a real-world economic, population and military baseline. War redraws the borders from there.</p></div>
            <div class="country-select__facts"><span><b>${COUNTRIES.length}</b> playable countries</span><span><b>Ready</b> opening reserve</span><span><b>Live</b> world ranking</span><span><b>Trained</b> military manpower</span></div>
          </div>
          <label class="country-search"><span>⌕</span><input id="country-search" type="search" value="${escapeHtml(this.introSearchQuery)}" placeholder="Search Belgium, Netherlands, Japan…" autocomplete="off"></label>
          <div class="country-select__body">
          <div class="country-grid">${countries.map((country) => {
            const perk = playerPerkForCountry(country.id);
            const searchableName = `${country.englishName} ${country.code}`.toLowerCase();
            return `<button class="${country.id === previewCountry.id ? 'is-selected' : ''}" data-action="preview-country" data-country="${country.id}" data-name="${escapeHtml(searchableName)}" aria-pressed="${country.id === previewCountry.id}" ${query && !searchableName.includes(query) ? 'hidden' : ''} style="--country:${this.engine.player(country.id)?.cssColor ?? '#6bdcf2'}">
              <i>${country.code.slice(0, 2)}</i><div><strong>${escapeHtml(country.englishName)}</strong><small>${escapeHtml(country.subregion)} · ${format(country.population, country.population < 10 ? 1 : 0)}M people</small><em>${escapeHtml(perk.name)}</em></div><span><b>${format(country.powerIndex)}</b><em>POWER</em></span>
            </button>`;
          }).join('')}</div>
          <aside class="country-preview" style="--country:${previewPlayer.cssColor}">
            <div class="country-preview__identity"><i>${previewCountry.code.slice(0, 2)}</i><div><span>STARTING RANK #${previewRank}</span><h2>${escapeHtml(previewCountry.englishName)}</h2><p>${escapeHtml(previewCountry.subregion)}</p></div><b>${format(previewCountry.powerIndex)}<small>POWER</small></b></div>
            <div class="country-preview__stats">
              <div><span>POPULATION</span><strong>${format(previewCountry.population, previewCountry.population < 10 ? 1 : 0)}M</strong></div>
              <div><span>GDP</span><strong>$${format(previewCountry.gdp)}B</strong></div>
              <div><span>DEFENCE SPEND</span><strong>$${format(previewCountry.military, 1)}B</strong></div>
              <div><span>ANNUAL GROWTH</span><strong class="${previewCountry.populationGrowthRate < 0 ? 'expense-value' : ''}">${previewCountry.populationGrowthRate >= 0 ? '+' : ''}${format(previewCountry.populationGrowthRate, 2)}%</strong></div>
              <div><span>FORCE HP</span><strong>${format(previewTerritory.force.hp)} / ${format(previewTerritory.force.maxHp)}</strong></div>
              <div><span>TRAINED FORCE</span><strong>${populationLossLabel(previewPlayer.manpower)}</strong></div>
            </div>
            <div class="country-preview__routes"><span>LAND FRONTS <b>${landRoutes}</b></span><span>SEA ROUTES <b>${seaRoutes}</b></span><span>STARTING CASH <b>$${format(this.engine.startingTreasury(previewCountry.id), 1)}B</b></span></div>
            <div class="country-preview__perk"><span>PLAYER ADVANTAGE</span><strong>${escapeHtml(previewPerk.name)}</strong><p>${escapeHtml(previewPerk.description)}</p><small>+${format(previewPerk.attackBonus * 100)}% ATK · +${format(previewPerk.defenseBonus * 100)}% DEF · +${format(previewPerk.recoveryBonus * 100)}% RECOVERY</small></div>
            <p class="country-preview__source">Real baseline: population ${previewCountry.populationYear} · growth ${previewCountry.populationGrowthYear} · GDP ${previewCountry.gdpYear} · defence ${previewCountry.militaryYear}</p>
            <button class="primary-button country-preview__start" data-action="choose-country" data-country="${previewCountry.id}">COMMAND ${escapeHtml(previewCountry.englishName.toUpperCase())}</button>
          </aside>
          </div>
          <footer><span>Data baseline: Natural Earth · World Bank · SIPRI</span><strong>Every country can conquer the world · campaign ends only at total conquest</strong></footer>
        </section>
      </div>
    `;
  }

  private renderHelp(): string {
    return `
      <div class="modal-backdrop">
        <section class="modal-card world-help">
          <button class="modal-close" data-action="help">×</button>
          <div class="panel-kicker">SITUATION ROOM FIELD MANUAL</div>
          <h2>You set direction. Your command systems execute.</h2>
          <div class="help-grid world-help-grid">
            <article><span>Ⅱ</span><h3>Time</h3><p>Only you control the clock. Space pauses; use 1× or 2× to advance weeks.</p></article>
            <article><span>↗</span><h3>One account</h3><p>Track every real income and expense. At peace, the finance director trims commitments to rebuild a $5B reserve; war can use the entire account.</p></article>
            <article><span>◇</span><h3>Empire defence</h3><p>Reserves move through owned countries toward the most hostile borders, even before war begins.</p></article>
            <article><span>⬡</span><h3>War</h3><p>High command plans objectives. Supply, supporting fronts, momentum, ATK, DEF and terrain decide whether the line advances or retreats.</p></article>
          </div>
          <div class="country-codex">${[...this.engine.state.players].sort((left, right) => (COUNTRY_BY_ID[right.id]?.powerIndex ?? 0) - (COUNTRY_BY_ID[left.id]?.powerIndex ?? 0)).slice(0, 12).map((player) => `<article style="--country:${player.cssColor}"><div><span>${player.sigil}</span><strong>${escapeHtml(player.name)}</strong></div><small>STARTING POWER ${format(COUNTRY_BY_ID[player.id]?.powerIndex ?? 0)}</small><p>${escapeHtml(player.profile)}</p></article>`).join('')}</div>
          <p class="help-tip"><b>War comes first:</b> economy and diplomacy support the army. Territory changes hands only through live front-line combat.</p>
        </section>
      </div>
    `;
  }

  private renderInbox(): string {
    const events = this.engine.state.events.slice().reverse();
    return `
      <div class="modal-backdrop modal-backdrop--soft">
        <section class="modal-card inbox-modal">
          <button class="modal-close" data-action="inbox">×</button>
          <div class="panel-kicker">SITUATION INBOX</div>
          <h2>World events</h2>
          <div class="inbox-filters"><span>${events.filter((event) => event.unread).length} unread</span><button data-action="mark-read">Mark all read</button></div>
          <div class="inbox-list">${events.map((event) => `<button class="${event.unread ? 'is-unread' : ''}" data-action="focus-event" data-territory="${event.territoryId ?? ''}"><b class="event-dot event-dot--${event.severity}"></b><div><span>WEEK ${event.tick} · ${event.kind.toUpperCase()}</span><strong>${escapeHtml(event.message)}</strong></div></button>`).join('')}</div>
        </section>
      </div>
    `;
  }

  private renderWarConfirmation(targetId: PlayerId): string {
    const human = this.engine.player(this.engine.state.humanPlayerId)!;
    const target = this.engine.player(targetId)!;
    const relation = this.engine.relation(this.engine.state.humanPlayerId, targetId)!;
    const ownTerritories = this.engine.territoriesOf(human.id);
    const targetTerritories = this.engine.territoriesOf(targetId);
    const ownPower = ownTerritories.reduce((sum, territory) => sum + this.engine.effectivePower(human.id, territory.force), 0);
    const enemyPower = targetTerritories.reduce((sum, territory) => sum + this.engine.effectivePower(targetId, territory.force), 0)
      * DEFENSIVE_POSITION_BONUS;
    const powerRatio = ownPower / Math.max(1, enemyPower);
    const stanceBonus = human.stance === 'assertive' ? 4 : human.stance === 'defensive' ? -4 : 0;
    const winChance = Math.round(Math.max(human.perk.id === 'phoenix-doctrine' ? 16 : 7, Math.min(94, 50 + Math.log(powerRatio) * 23 + stanceBonus)));
    const potentialEconomy = targetTerritories.reduce((sum, territory) => sum + territory.economy, 0);
    const potentialPopulation = targetTerritories.reduce((sum, territory) => sum + territory.population, 0);
    const potentialDefence = targetTerritories.reduce((sum, territory) => sum + (COUNTRY_BY_ID[territory.id]?.military ?? 0), 0);
    const accessType = this.engine.warAccessType(human.id, target.id);
    const mobilizationCost = this.engine.warMobilizationCost(human.id, target.id);
    const canFundMobilization = human.treasury >= mobilizationCost;
    const frontNames = ownTerritories.flatMap((territory) => (TERRITORY_BY_ID[territory.id]?.neighbors ?? [])
      .filter((neighborId) => this.engine.state.territories[neighborId]?.ownerId === targetId)
      .map((neighborId) => `${TERRITORY_BY_ID[neighborId]?.name ?? neighborId}${isSeaConnection(territory.id, neighborId) ? ' · NAVAL' : ''}`));
    const uniqueFronts = [...new Set(frontNames)].slice(0, 3);
    return `
      <div class="modal-backdrop">
        <section class="modal-card war-confirm" style="--target:${target.cssColor}">
          <div class="war-confirm__sigil">${target.sigil}</div>
          <div class="panel-kicker">WAR ROOM FORECAST · ESTIMATE, NOT A GUARANTEE</div>
          <h2>Declare war on ${escapeHtml(target.name)}?</h2>
          <p>Opening control grows slowly while both armies remain operational. Destroying a region's defending force captures it immediately; a larger empire continues fighting from its surviving regions. The clearly weaker side may later request peace for reparations or land.</p>
          <div class="war-forecast"><div class="war-forecast__chance"><span>ESTIMATED CHANCE TO WIN</span><strong>${winChance}%</strong><i><b style="width:${winChance}%"></b></i><small>Your power ${format(ownPower)} · enemy ${format(enemyPower)} · relation ${signed(relation.score)}</small></div><div class="war-forecast__front"><span>OPENING FRONT${uniqueFronts.length > 1 ? 'S' : ''}</span><strong>${escapeHtml(uniqueFronts.join(' · ') || 'No direct front')}</strong><small>Forecast changes with production, research, HP and readiness.</small></div></div>
          <div class="mobilization-bill ${canFundMobilization ? 'is-funded' : 'is-unfunded'}"><div><span>${accessType === 'naval' ? 'NAVAL ' : ''}MOBILISATION COST</span><strong>−$${format(mobilizationCost, 1)}B</strong></div><div><span>NATIONAL ACCOUNT</span><strong>$${format(human.treasury, 1)}B</strong></div><p>${canFundMobilization ? accessType === 'naval' ? 'Affordable now. Cost scales with the defender’s current force, population, economy and territory, plus the +85% overseas logistics surcharge.' : 'Affordable now. Cost scales with the defender’s current force, population, economy and territory.' : 'Insufficient balance. Let the national account recover before this war begins; larger powers require a larger mobilisation bill.'}</p></div>
          <span class="section-label">IF ${escapeHtml(target.shortName).toUpperCase()} IS FULLY DEFEATED</span>
          <div class="war-spoils"><div><span>COUNTRIES</span><strong>+${targetTerritories.length}</strong></div><div><span>ECONOMY</span><strong>+${format(potentialEconomy, 1)}</strong></div><div><span>POPULATION</span><strong>+${format(potentialPopulation, 1)}M</strong></div><div><span>DEFENCE BASE</span><strong>$${format(potentialDefence, 1)}B</strong></div></div>
          <div class="war-risk"><span>Defender receives +25% strength</span><span>Population and economy suffer</span><span>Only the loser can request mid-war peace</span><span>Naval wars cost +85% and lose 18% attack efficiency</span></div>
          <div class="panel-actions"><button class="ghost-button" data-action="cancel-war">Cancel</button><button class="danger-button" data-action="declare-war" ${canFundMobilization ? '' : 'disabled'}>Declare ${accessType === 'naval' ? 'naval ' : ''}war · $${format(mobilizationCost, 1)}B</button></div>
        </section>
      </div>
    `;
  }

  private renderGameOver(): string {
    const winner = this.engine.player(this.engine.state.winnerId ?? '')!;
    return `
      <div class="modal-backdrop">
        <section class="modal-card victory-card" style="--winner:${winner.cssColor}">
          <div class="victory-sigil">${winner.sigil}</div><div class="panel-kicker">WORLD CONQUEST COMPLETE</div>
          <h1>${escapeHtml(winner.name)}</h1><p>controls every playable country on the map.</p>
          <button class="primary-button" data-action="new-game">New campaign</button>
        </section>
      </div>
    `;
  }

  private bindActions(): void {
    this.hud.querySelectorAll<HTMLElement>('[data-action]').forEach((element) => {
      element.addEventListener('pointerdown', (event) => {
        this.suppressMapUntil = performance.now() + 500;
        event.stopPropagation();
      });
      element.addEventListener('pointerup', (event) => event.stopPropagation());
      element.addEventListener('click', (event) => {
        this.suppressMapUntil = performance.now() + 500;
        event.stopPropagation();
        const action = element.dataset.action;
        switch (action) {
          case 'preview-country':
            this.introPreviewCountryId = element.dataset.country!;
            this.render();
            break;
          case 'choose-country': {
            const countryId = element.dataset.country!;
            this.introOpen = false;
            if (!this.engine.chooseCountry(countryId)) {
              this.introOpen = true;
              this.toast('This country cannot be selected now.');
              break;
            }
            this.diplomacyTargetId = TERRITORY_BY_ID[countryId]?.neighbors[0] ?? '';
            this.selectedTerritoryId = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            mapBridge.scene?.focusCountry?.(countryId);
            this.engine.setSpeed(1);
            break;
          }
          case 'speed': this.engine.setSpeed(Number(element.dataset.speed) as WorldSpeed); break;
          case 'panel': this.setPanel(element.dataset.panel as 'war' | 'economy' | 'research' | 'diplomacy'); break;
          case 'ranking':
            this.selectedTerritoryId = undefined;
            this.updateMapSelection();
            this.setPanel('ranking');
            break;
          case 'close-panel':
            this.selectedTerritoryId = undefined;
            this.contextPanelOpen = false;
            this.updateMapSelection();
            this.render();
            break;
          case 'camera-reset': mapBridge.scene?.resetCamera(); break;
          case 'help': this.helpOpen = !this.helpOpen; this.render(); break;
          case 'inbox': this.inboxOpen = !this.inboxOpen; this.render(); break;
          case 'mark-read': this.engine.markAllEventsRead(); break;
          case 'toggle-feed': this.eventFeedOpen = !this.eventFeedOpen; this.render(); break;
          case 'focus-event': {
            const territoryId = element.dataset.territory;
            this.inboxOpen = false;
            if (territoryId && this.engine.state.territories[territoryId]) {
              this.selectedTerritoryId = territoryId;
              this.updateMapSelection();
              mapBridge.scene?.focusAction(undefined, territoryId);
            }
            this.render();
            break;
          }
          case 'focus-war': {
            const territoryId = element.dataset.territory;
            if (territoryId && this.engine.state.territories[territoryId]) {
              this.selectedTerritoryId = territoryId;
              this.contextPanelOpen = false;
              this.updateMapSelection();
              mapBridge.scene?.focusAction(undefined, territoryId);
            }
            this.render();
            break;
          }
          case 'clear-territory': this.selectedTerritoryId = undefined; this.contextPanelOpen = false; this.updateMapSelection(); this.render(); break;
          case 'open-owner-diplomacy':
            this.diplomacyTargetId = element.dataset.player!;
            this.selectedTerritoryId = undefined;
            this.updateMapSelection();
            this.setPanel('diplomacy');
            break;
          case 'quick-war':
            this.diplomacyTargetId = element.dataset.player!;
            this.confirmWarTargetId = this.diplomacyTargetId;
            this.render();
            break;
          case 'start-upgrade':
            if (!this.engine.startManagementUpgrade(this.engine.state.humanPlayerId, element.dataset.upgrade as ManagementUpgradeId)) {
              this.toast('Project unavailable: another programme is active, the account balance is too low, or the maximum level is reached.');
            }
            break;
          case 'diplomacy-target': this.diplomacyTargetId = element.dataset.player!; this.render(); break;
          case 'improve-relations':
            if (!this.engine.improveRelations(this.engine.state.humanPlayerId, this.diplomacyTargetId)) this.toast('Insufficient influence or action unavailable.');
            break;
          case 'treaty':
            if (!this.engine.proposeTreaty(this.engine.state.humanPlayerId, this.diplomacyTargetId, element.dataset.treaty as TreatyType)) this.toast('This offer is not available now.');
            else this.toast('Offer sent.');
            break;
          case 'peace-settlement':
            if (!this.engine.proposePeaceSettlement(this.engine.state.humanPlayerId, element.dataset.player!, element.dataset.settlement as PeaceSettlementType)) this.toast('Only the clearly weaker side can request peace after sustained fighting.');
            else this.toast('Peace terms sent by the losing side.');
            break;
          case 'confirm-war': this.confirmWarTargetId = this.diplomacyTargetId; this.render(); break;
          case 'cancel-war': this.confirmWarTargetId = undefined; this.render(); break;
          case 'declare-war':
            if (this.confirmWarTargetId && !this.engine.declareWar(this.engine.state.humanPlayerId, this.confirmWarTargetId)) this.toast('War cannot be declared: check access, truce status and account balance.');
            this.confirmWarTargetId = undefined;
            this.render();
            break;
          case 'respond-offer':
            this.engine.respondToOffer(element.dataset.offer!, element.dataset.accept === 'true');
            break;
          case 'new-game': window.location.reload(); break;
        }
      });
    });
    const search = this.hud.querySelector<HTMLInputElement>('#country-search');
    search?.addEventListener('input', () => {
      const query = search.value.trim().toLocaleLowerCase('en');
      this.introSearchQuery = search.value;
      for (const option of this.hud.querySelectorAll<HTMLElement>('.country-grid [data-name]')) {
        option.hidden = query.length > 0 && !(option.dataset.name ?? '').includes(query);
      }
    });
  }
}
