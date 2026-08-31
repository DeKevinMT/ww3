import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANTARCTIC_SECTORS_V2, ARCTIC_PROJECTS_V2 } from '../sim/v2/polarEndgame';
import worldUiSource from './WorldUIV2.ts?raw';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('polar command UI', () => {
  it('keeps five stable command tabs and routes North Pole selection into Research', () => {
    const dock = worldUiSource.slice(
      worldUiSource.indexOf('<nav class="command-dock'),
      worldUiSource.indexOf('</nav>', worldUiSource.indexOf('<nav class="command-dock')),
    );
    expect(dock.match(/data-panel=/g)).toHaveLength(5);
    expect(dock).toContain('data-panel="war"');
    expect(dock).toContain('data-panel="commander"');
    expect(dock).toContain('<b>APEX</b>');
    expect(dock).toContain('data-panel="nation"');
    expect(dock).toContain('data-panel="research"');
    expect(dock).toContain('data-panel="economy"');
    expect(worldUiSource).toContain("type PanelMode = 'war' | 'commander' | 'nation' | 'research' | 'economy' | 'ranking';");
    expect(worldUiSource).toContain('mapBridge.onPolarRegionClick = (region) =>');
    expect(worldUiSource).toContain('mapBridge.onPolarSectorClick = (sectorId) =>');
    expect(worldUiSource).toContain('this.selectTerritory(territoryIdV2(sectorId));');
    expect(worldUiSource).toContain('private selectedPolarRegion?: MapPolarRegion;');
    expect(worldUiSource).toContain("if (this.selectedPolarRegion === 'arctic') return this.renderResearchPanel(human, finance);");
    expect(worldUiSource).toContain("if (this.selectedPolarRegion === 'antarctica') return this.renderAntarcticaPanel(human);");
    expect(worldUiSource).toContain("if (this.panelMode === 'commander') return this.renderCommanderPanel(human);");
    expect(worldUiSource).toContain('this.selectedTerritoryId = undefined;');
    expect(worldUiSource).toContain('mapBridge.scene?.focusPolarRegion?.(region);');
  });

  it('integrates North Pole research while keeping Antarctica intelligence separate', () => {
    const research = methodSource('  private renderResearchPanel(', '  private renderMilitaryCommandOverview(');
    const war = methodSource('  private renderWarPanel(', '  private warTargetRecommendations(');
    expect(research).toContain('this.renderPolarResearchItem(human)');
    expect(war).toContain('this.renderAntarcticaGatewayCard()');
    expect(worldUiSource).toContain('data-polar-region="antarctica"');
    expect(worldUiSource).not.toContain('renderArcticPanel');
    expect(worldUiSource).not.toContain('renderArcticGatewayCard');
  });

  it('renders one sequential signal program from canonical definitions and terms', () => {
    const panel = methodSource('  private renderPolarResearchItem(', '  private renderPolarCompletedEffects(');
    expect(panel).toContain("entries.find(({ terms }) => terms.status === 'active')");
    expect(panel).toContain("entries.find(({ terms }) => terms.status !== 'complete')");
    expect(panel).toContain('this.engine.arcticProjectTerms(human.id, project.id)');
    expect(panel).toContain('data-action="start-arctic-project"');
    expect(panel).toContain('START ANALYSIS · ${cash(terms.cost)}');
    expect(panel).toContain("const effect = project.benefits.join(' · ')");
    expect(panel).toContain('terms.cost');
    expect(panel).toContain('terms.durationTicks');
    expect(panel).toContain('terms.completesTick');
    expect(worldUiSource).not.toContain('Own an Arctic country');
    expect(worldUiSource).toContain('this.engine.startArcticProject');
    expect(panel).not.toMatch(/20W|20 WEEKS|OPTIONAL/);
  });

  it('keeps all fourteen North Pole stages in one compact current-stage card and one aggregate effect row', () => {
    expect(ARCTIC_PROJECTS_V2).toHaveLength(14);
    const completed = methodSource(
      '  private renderPolarCompletedEffects(',
      '  private renderAntarcticaGatewayCard(',
    );
    expect(completed).toContain('selectNorthPoleModifiersV2');
    expect(completed).toContain('NORTH POLE NETWORK');
    expect(completed).toContain('Signal Purge');
    expect(completed).toContain('Antarctic power');
    expect(completed).not.toContain('.map((project');
  });

  it('uses the single APEX transmission overlay and no legacy polar warning', () => {
    expect(worldUiSource).not.toContain('renderPolarWarning');
    expect(worldUiSource).not.toContain('data-action="acknowledge-polar-warning"');
    expect(worldUiSource).not.toContain('polar-warning-backdrop');
    expect(worldUiSource).toContain('SECURE ALLIED CHANNEL');
    expect(worldUiSource).toContain('APEX SIGNAL ANALYSIS · STAGE');
    expect(worldUiSource).toContain('data-polar-region="antarctica"');
  });

  it('renders all nine Antarctic definitions as real owner-aware territory cards', () => {
    expect(ANTARCTIC_SECTORS_V2).toHaveLength(9);
    expect(new Set(ANTARCTIC_SECTORS_V2.map((sector) => sector.id))).toHaveLength(9);
    expect(ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'gateway')).toHaveLength(3);
    expect(ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'outer')).toHaveLength(3);
    expect(ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'inner')).toHaveLength(2);
    expect(ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'core')).toHaveLength(1);

    const panel = methodSource('  private renderAntarcticaPanel(', '  private renderNationPanel(');
    expect(panel).toContain("this.engine.content.nations[id]?.kind === 'rogue-ai'");
    expect(panel).toContain('Object.entries(state.territories)');
    expect(panel).toContain('.filter(([, territory]) => territory.owner === rogueId)');
    expect(panel).toContain('const territory = state.territories[territoryId];');
    expect(panel).toContain('const machineControlled = territory.owner === rogueId;');
    expect(panel).toContain('const securedByPlayer = territory.owner === human.id;');
    expect(panel).toContain('data-action="focus-event" data-territory="${sector.id}"');
    expect(panel).toContain('ACTIVE ARMY');
    expect(panel).toContain('territory.army.manpower');
    expect(panel).toContain('territory.army.capacity');
    expect(panel).toContain('this.engine.territoryPower(territoryId)');
    expect(panel).toContain('this.engine.effectiveAttack(owner.id, territory.army)');
    expect(panel).toContain('this.engine.effectiveDefense(owner.id, territory.army)');
    expect(panel).toContain('ECONOMY');
    expect(panel).toContain('territory.economy');
    expect(panel).toContain('Its real opening army is roughly 20% stronger than the full Arctic Dawnline bloc.');
    expect(panel).toContain('PERIMETER STATES · WEAKEST');
    expect(panel).toContain('SOVEREIGN MACHINE CORE · STRONGEST');
    expect(worldUiSource).toContain("mapBridge.scene?.focusPolarSector?.(sectorId)");
  });

  it('shows physical expansion, manufactured waves, live logistics and the real core objective', () => {
    const panel = methodSource('  private renderAntarcticaPanel(', '  private renderNationPanel(');
    expect(panel).toContain('const occupiedWorld = rogueTerritories.filter(([id]) => !antarcticIds.has(String(id))).length;');
    expect(panel).toContain('const activeWars = rogueId ? state.wars.filter((war) =>');
    expect(panel).toContain('Permanent machine war');
    expect(panel).toContain('PHYSICAL EXPANSION');
    expect(panel).toContain('Every conquest advances from Antarctica through an open gateway and enters rapid assimilation.');
    expect(panel).toContain('SOVEREIGN WORLD');
    expect(panel).toContain('Every country opens fully mobilised with normal resources');
    expect(panel).toContain('polar.nextCounteroffensiveTick');
    expect(panel).toContain('+5% verified Antarctic reinforcements each year');
    expect(panel).toContain('selectRogueLogisticsTelemetryV2(');
    expect(panel).toContain('this.engine.recentLogisticsMovements()');
    expect(panel).toContain('TROOP MOVEMENTS · THIS WEEK');
    expect(panel).toContain('rogueLogistics?.movedManpower');
    expect(panel).toContain('FROM ANTARCTICA');
    expect(panel).toContain('rogueLogistics?.antarcticMovedManpower');
    expect(panel).toContain('NAVAL ROUTES');
    expect(panel).toContain('rogueLogistics?.navalCost');
    expect(panel).toContain('FRONT SUPPLY');
    expect(panel).toContain('rogueLogistics?.averageFrontSupply');
    expect(panel).toContain('rogueLogistics?.weakestFrontSupply');
    expect(panel).toContain("const coreId = territoryIdV2('zero-point-core');");
    expect(panel).toContain('const core = state.territories[coreId];');
    expect(panel).toContain('core.owner === rogueId');
    expect(panel).toContain('ZERO-POINT CORE · SOVEREIGN CAPITAL');
    expect(panel).toContain('capture this territory to end the invasion');
  });

  it('contains no expedition controls, quotes or deployment handlers', () => {
    const panel = methodSource('  private renderAntarcticaPanel(', '  private renderNationPanel(');
    for (const removedToken of [
      'antarcticExpeditionTerms',
      'deployAntarcticExpedition',
      'data-action="deploy-antarctic-expedition"',
      'polar-expedition-input',
      'renderPolarSectorCard',
      'selectedPolarSectorId',
      'selectPolarSector(',
    ]) {
      expect(worldUiSource).not.toContain(removedToken);
      expect(panel).not.toContain(removedToken);
    }
    expect(panel).not.toContain('polar.expeditions');
    expect(panel).not.toContain('polar.sectors');
    expect(stylesSource).not.toContain('polar-sector-deployment');
    expect(stylesSource).not.toContain('polar-expedition-input');
  });

  it('clears polar focus explicitly on every close and reset path', () => {
    expect(worldUiSource).toContain('private clearPolarSelection(): void');
    expect(worldUiSource).toContain('mapBridge.scene?.clearPolarFocus?.();');
    expect(worldUiSource).toContain('mapBridge.onPolarSectorClick = undefined;');
    expect(worldUiSource).toContain("case 'camera-reset': {");
    expect(worldUiSource).toContain('this.clearPolarSelection();');
  });

  it('does not leak future polar phase names before the sequence reveals them', () => {
    const gateway = methodSource('  private renderAntarcticaGatewayCard(', '  private renderAntarcticaPanel(');
    expect(gateway).not.toContain('Complete Deep-Ice Signals');
    expect(worldUiSource).not.toContain('The final North Pole research project can triangulate');
    expect(gateway).toContain('ROGUE ATTENTION');
    expect(gateway).toContain('SIGNAL ENCRYPTED');
    expect(gateway).not.toMatch(/awakens|activates|unlocks the invasion/i);
  });

  it('credits the final Zero Point Core commander without unsafe winner assumptions', () => {
    const gameOver = methodSource('  private renderGameOver(', '  private renderSpectatorBanner(');
    expect(gameOver).toMatch(/polar\.victoryCommanderId\s*\?\? state\.winnerId\s*\?\? polar\.revealedBy\s*\?\? state\.humanPlayerId/);
    expect(gameOver).toContain('ZERO-POINT CORE CAPTURED · SURVIVAL COMPLETE');
    expect(gameOver).toContain('captured the real Zero-Point territory and ended the Rogue Empire');
    expect(gameOver).toContain('state.territories[territoryIdV2(sector.id)]?.owner !== rogueId');
    expect(gameOver).toContain('MACHINE TERRITORIES LEFT');
    expect(gameOver).toContain('invasion-wave network are now offline');
    expect(gameOver).not.toContain('expedition');
    expect(gameOver).not.toContain('first exposed the Antarctic signal');
    expect(gameOver).not.toContain("player(this.engine.state.winnerId ?? '')!");
    expect(worldUiSource).toContain('if (state.gameOver) {');
  });

  it('keeps integrated Research and Antarctica responsive outside transmissions', () => {
    const blocker = methodSource('  private syncMapInputBlock(', '  private readonly onKeyDown');
    expect(blocker).not.toContain('confirmArcticProjectId');
    expect(blocker).not.toContain('polarWarningPending');
    expect(stylesSource).toContain('.world-ui-v2 .polar-command');
    expect(stylesSource).toContain('.world-ui-v2 .apex-transmission-backdrop');
    expect(stylesSource).toContain('.world-ui-v2 .rogue-empire-hero');
    expect(stylesSource).toContain('.world-ui-v2 .rogue-state-list');
    expect(stylesSource).toContain('.world-ui-v2 .rogue-state-card');
    expect(stylesSource).toContain('@media (max-width: 460px)');
    expect(stylesSource).toContain('.world-ui-v2 .rogue-state-card > section { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
    expect(stylesSource).toContain('.world-ui-v2 .polar-quote-grid small');
    expect(stylesSource).toContain('line-height: 1.45;');
  });

  it('projects the canonical campaign revision into the map snapshot', () => {
    expect(worldUiSource).toContain('function mapPolarEndgameSnapshotV2(');
    expect(worldUiSource).toContain('visualRevision: polar.visualRevision');
    expect(worldUiSource.match(/polarEndgame: mapPolarEndgameSnapshotV2\(source\)/g)).toHaveLength(2);
  });
});
