import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
  it('opens a contextual polar drawer without adding a fifth command tab', () => {
    const dock = worldUiSource.slice(
      worldUiSource.indexOf('<nav class="command-dock'),
      worldUiSource.indexOf('</nav>', worldUiSource.indexOf('<nav class="command-dock')),
    );
    expect(dock.match(/data-panel=/g)).toHaveLength(4);
    expect(worldUiSource).toContain('mapBridge.onPolarRegionClick = (region) =>');
    expect(worldUiSource).toContain('mapBridge.onPolarSectorClick = (sectorId) =>');
    expect(worldUiSource).toContain('this.selectPolarSector(sectorId as AntarcticSectorIdV2)');
    expect(worldUiSource).toContain('private selectedPolarRegion?: MapPolarRegion;');
    expect(worldUiSource).toContain("if (this.selectedPolarRegion === 'arctic') return this.renderArcticPanel(human);");
    expect(worldUiSource).toContain("if (this.selectedPolarRegion === 'antarctica') return this.renderAntarcticaPanel(human);");
    expect(worldUiSource).toContain('this.selectedTerritoryId = undefined;');
    expect(worldUiSource).toContain('mapBridge.scene?.focusPolarRegion?.(region);');
  });

  it('provides Research and War fallback gateways to both map regions', () => {
    const research = methodSource('  private renderResearchPanel(', '  private renderMilitaryCommandOverview(');
    const war = methodSource('  private renderWarPanel(', '  private warTargetRecommendations(');
    expect(research).toContain('this.renderArcticGatewayCard(human)');
    expect(war).toContain('this.renderAntarcticaGatewayCard()');
    expect(worldUiSource).toContain('data-polar-region="arctic"');
    expect(worldUiSource).toContain('data-polar-region="antarctica"');
  });

  it('renders the sequential manual Arctic program from canonical definitions and terms', () => {
    const panel = methodSource('  private renderArcticPanel(', '  private renderPolarSectorCard(');
    expect(panel).toContain("projectEntries.find(({ terms }) => terms.status === 'active')");
    expect(panel).toContain("projectEntries.find(({ terms }) => terms.status === 'available')");
    expect(panel).toContain('(focusEntry ? [focusEntry] : [])');
    expect(panel).toContain('One linked four-phase sequence');
    expect(panel).toContain('this.engine.arcticProjectTerms(human.id, project.id)');
    expect(panel).toContain('data-action="start-arctic-project"');
    expect(panel).toContain('polar-project-progress');
    expect(panel).toContain('this.renderArcticProjectRewards(human, project, terms.status)');
    expect(panel).toContain("status === 'complete'");
    expect(panel).toContain('Math.max(0, currentLevel - reward.levels)');
    expect(panel).not.toContain('reward.label');
    expect(panel).toContain('this.renderArcticQuoteBreakdown(human, terms)');
    expect(panel).toContain('terms.openingMilitaryRankCostFactor');
    expect(panel).toContain('terms.affinityCostModifier');
    expect(panel).toContain('terms.accessPointCount');
    expect(panel).toContain('terms.researchSpeedDurationReduction');
    const quote = methodSource('  private renderArcticQuoteBreakdown(', '  private renderPolarSectorCard(');
    expect(quote).not.toContain('economyCostScale');
    expect(panel).toContain('terms.completesTick');
    expect(panel).toContain("deepIceKnown ? 'DEEP-ICE PROGRAM' : 'ARCTIC PROGRAM'");
    expect(worldUiSource).toContain('data-action="confirm-arctic-project"');
    expect(worldUiSource).toContain('this.engine.startArcticProject');
  });

  it('keeps the persisted warning modal explicit and non-dismissible by backdrop', () => {
    const warning = methodSource('  private renderPolarWarning(', '  private renderArcticProjectConfirmation(');
    expect(worldUiSource).toContain('polar.warningAcknowledgedBy.includes(playerId)');
    expect(warning).toContain('aria-modal="true"');
    expect(warning).toContain('data-action="acknowledge-polar-warning"');
    expect(warning).not.toContain('modal-close');
    expect(warning.match(/data-action=/g)).toHaveLength(1);
    expect(worldUiSource).toContain('this.engine.acknowledgePolarWarning');
    expect(worldUiSource).toContain("this.selectedPolarRegion = 'antarctica';");
    expect(worldUiSource).toContain("mapBridge.scene?.focusPolarRegion?.('antarctica');");
  });

  it('shows three corridors, sector progression, cooperation and manual expedition controls', () => {
    const panel = methodSource('  private renderAntarcticaPanel(', '  private renderPolarWarning(');
    expect(panel).toContain("ANTARCTIC_SECTORS_V2.filter((sector) => sector.region === 'gateway')");
    expect(panel).toContain('DRAKE · SOUTH AMERICA');
    expect(panel).toContain('MAUD · SOUTHERN AFRICA');
    expect(panel).toContain('ROSS · OCEANIA');
    expect(panel).toContain('EARTH DEFENCE');
    expect(panel).toContain('RESEARCH SHARING');
    expect(panel).toContain('SUSPICION RELIEF');
    expect(panel).toContain('ZERO-POINT CORE');
    expect(worldUiSource).toContain('this.engine.antarcticExpeditionTerms');
    expect(worldUiSource).toContain('data-action="deploy-antarctic-expedition"');
    expect(worldUiSource).toContain('this.engine.deployAntarcticExpedition');
    expect(worldUiSource).toContain("querySelectorAll<HTMLInputElement>('.polar-expedition-input')");
    expect(worldUiSource).toContain('private selectedPolarSectorId?: AntarcticSectorIdV2;');
    expect(worldUiSource).toContain('sectorCard?.scrollIntoView');
    expect(worldUiSource).toContain("mapBridge.scene?.focusPolarSector?.(sectorId)");
  });

  it('clears polar focus explicitly on every close and reset path', () => {
    expect(worldUiSource).toContain('private clearPolarSelection(): void');
    expect(worldUiSource).toContain('mapBridge.scene?.clearPolarFocus?.();');
    expect(worldUiSource).toContain('mapBridge.onPolarSectorClick = undefined;');
    expect(worldUiSource).toContain("case 'camera-reset': {");
    expect(worldUiSource).toContain('this.clearPolarSelection();');
  });

  it('does not leak future polar phase names before the sequence reveals them', () => {
    const gateway = methodSource('  private renderAntarcticaGatewayCard(', '  private renderArcticPanel(');
    expect(gateway).not.toContain('Complete Deep-Ice Signals');
    expect(worldUiSource).not.toContain('The final North Pole research project can triangulate');
    expect(worldUiSource).toContain('Future programmes remain classified');
  });

  it('credits the final Zero Point Core commander without unsafe winner assumptions', () => {
    const gameOver = methodSource('  private renderGameOver(', '  private renderSpectatorBanner(');
    expect(gameOver).toMatch(/polar\.victoryCommanderId\s*\?\? state\.winnerId\s*\?\? polar\.revealedBy\s*\?\? state\.humanPlayerId/);
    expect(gameOver).toContain('led the final Zero Point Core expedition');
    expect(gameOver).not.toContain('first exposed the Antarctic signal');
    expect(gameOver).not.toContain("player(this.engine.state.winnerId ?? '')!");
    expect(worldUiSource).toContain('if (state.gameOver) {');
  });

  it('blocks map input only for polar modals and keeps the drawers responsive', () => {
    const blocker = methodSource('  private syncMapInputBlock(', '  private readonly onKeyDown');
    expect(blocker).toContain('Boolean(this.confirmArcticProjectId)');
    expect(blocker).toContain('this.polarWarningPending()');
    expect(stylesSource).toContain('.world-ui-v2 .polar-command');
    expect(stylesSource).toContain('.world-ui-v2 .polar-warning-backdrop');
    expect(stylesSource).toContain('.world-ui-v2 .polar-corridor-grid');
    expect(stylesSource).toContain('@media (max-width: 460px)');
    expect(stylesSource).toContain('.world-ui-v2 .polar-sector-deployment { grid-template-columns: 1fr; }');
    expect(stylesSource).toContain('.world-ui-v2 .polar-quote-grid small');
    expect(stylesSource).toContain('font-size: 10px; line-height: 1.45;');
    expect(stylesSource).toContain('.world-ui-v2 .polar-sector-card.is-focused');
  });

  it('projects the canonical campaign revision into the map snapshot', () => {
    expect(worldUiSource).toContain('function mapPolarEndgameSnapshotV2(');
    expect(worldUiSource).toContain('visualRevision: polar.visualRevision');
    expect(worldUiSource.match(/polarEndgame: mapPolarEndgameSnapshotV2\(source\)/g)).toHaveLength(2);
  });
});
