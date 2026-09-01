import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RESEARCH_CATEGORIES,
  RESEARCH_CATEGORY_DIRECTIONS,
} from '../sim/v2/researchDirections';
import worldUiSourceRaw from './WorldUIV2.ts?raw';

const normalized = (source: string): string => source.replace(/\r\n/g, '\n');
const worldUiSource = normalized(worldUiSourceRaw);
const stylesSource = normalized(readFileSync(new URL('../styles.css', import.meta.url), 'utf8'));

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('command UI information architecture', () => {
  it('does not overstate a low-confidence opening as a certain collapse', () => {
    expect(worldUiSource).toContain("estimate.confidence === 'low'");
    expect(worldUiSource).toContain("'Early advantage'");
    expect(worldUiSource).toContain("'Early danger'");
    expect(worldUiSource).toContain("'Even opening'");
  });

  it('keeps exactly five readable command tabs', () => {
    const dock = worldUiSource.slice(
      worldUiSource.indexOf('<nav class="command-dock'),
      worldUiSource.indexOf('</nav>', worldUiSource.indexOf('<nav class="command-dock')),
    );
    expect(dock.match(/data-panel=/g)).toHaveLength(5);
    for (const label of ['WAR', 'NATION', 'RESEARCH', 'ECONOMY', 'EONSCAR']) {
      expect(dock).toContain(`<b>${label}</b>`);
    }
    expect(dock).not.toContain('PROGRESS');
  });

  it('keeps War decision-first while EONSCAR support stays autonomous', () => {
    const panel = methodSource('  private renderWarPanel(', '  private warTargetRecommendations(');
    expect(panel).toContain('command-drawer--decision');
    expect(panel).toContain('war-primary-front');
    expect(panel).toContain('Best targets');
    expect(panel).toContain('Power · chance · route · recurring cost');
    expect(panel).toContain('EONSCAR allocates the shared shield automatically');
    expect(panel).not.toContain('FOCUS FRONT');
    expect(panel).toContain('decision-details');
    expect(panel.indexOf('this.renderAntarcticaGatewayCard()'))
      .toBeGreaterThan(panel.indexOf('Best targets'));
    expect(panel).toContain('renderWarCard(');
    expect(panel).toContain("item.id === 'campaign-signal-anomaly'");
    expect(panel).toContain('const humanWarsUnlocked = campaignHumanWarsUnlockedV2(');
    expect(panel).toContain('const recommendations = humanWarsUnlocked');
    expect(panel).toMatch(
      /const targetIntel = humanWarsUnlocked[\s\S]*No legal target is currently in land or naval range\.[\s\S]*: warsUnlocked[\s\S]*EONSCAR IS PREPARING YOUR FIRST TARGET/,
    );
    expect(panel).not.toContain('FIRST-STRIKE BRIEFING PENDING');
    expect(panel).not.toContain('INTELLIGENCE PENDING');
    expect(panel).toContain('INITIAL SCAN IN PROGRESS');
    expect(panel).toMatch(
      /apexOpeningBriefingKnown[\s\S]*SIGNAL TRIANGULATION REQUIRED[\s\S]*INITIAL SCAN IN PROGRESS/,
    );
    expect(panel).toContain('data-panel="research">OPEN RESEARCH');
    expect(panel).not.toMatch(/FOCUS \+ SEND APEX|focus-apex-front|commander-order|SEND APEX/);
  });

  it('shows one EONSCAR-inclusive win chance and only decision-grade target intel', () => {
    const target = methodSource('  private renderTargetRecommendation(', '  private renderWarCard(');
    expect(target.match(/\$\{format\(candidate\.chance, 1\)\}/g)).toHaveLength(1);
    expect(target).toContain('war-intel-card__decision');
    expect(target).toContain('ENEMY POWER ${compactNumber(targetPower)}');
    expect(target).toContain('${readiness.percent}% SUPPLIED');
    expect(target).toContain('${supplyRule}');
    expect(target).toContain("candidate.access === 'naval' ? 'naval' : 'land'");
    expect(target).not.toMatch(/WITH APEX|WITHOUT APEX|chanceDelta|IQ gain|army ·|reserve ·/);
  });

  it('shows annual funded and required upkeep before readiness', () => {
    const military = methodSource(
      '  private renderMilitaryCommandOverview(',
      '  private renderWarPanel(',
    );
    const upkeepRowStart = military.indexOf("readinessRow('UPKEEP FUNDED'");
    const upkeepRow = military.slice(upkeepRowStart, military.indexOf('\n', upkeepRowStart));
    expect(upkeepRow).toContain('cash(annual(finance.fundedArmyUpkeep))');
    expect(upkeepRow).toContain('cash(annual(finance.armyUpkeep))');
    expect(upkeepRow).toContain("'funded / required each year'");
    expect(military).toContain('<b>${format(ratio * 100, 0)}%</b>');
  });

  it('keeps Nation power-first and moves depth behind disclosure', () => {
    const nation = methodSource('  private renderNationPanel(', '  private renderEconomyPanel(');
    for (const stat of ['POWER', 'TERRITORIES', 'EONSCAR SIGNAL PURGE', 'PEOPLE']) {
      expect(nation).toContain(`<span>${stat}</span>`);
    }
    expect(nation).toContain('drawer:nation:people');
    expect(nation).not.toMatch(/food/i);
    expect(nation).toContain('EONSCAR purge &amp; national IQ');
    expect(nation).toContain('Nation systems');
    expect(nation).not.toMatch(/Treaties|PEACE/);
    expect(nation).toContain('decision-details');
    expect(nation).not.toMatch(/WORLD HOSTILITY|POLITICAL SUSPICION|REVOLT|CONTAINMENT|coalitionNames/);
  });

  it('renders EONSCAR as a compact read-only autonomous status surface', () => {
    const apex = methodSource('  private renderCommanderPanel(', '  private pendingApexTransmission(');
    expect(apex).toContain('<h2>EONSCAR</h2>');
    expect(apex).toContain('selectCommanderAutonomyStatusV2');
    expect(apex).toContain('AUTO · ${escapeHtml(networkStatus)}');
    for (const label of ['ENERGY', 'ARMY SUPPORT', 'BACKUP ENERGY', 'EMPIRE CONTRIBUTION', 'NETWORK SUPPORT']) {
      expect(apex).toContain(label);
    }
    expect(apex).toContain('OVERDRIVE ${lancer.supportedAssaultCount}/3');
    expect(apex).toContain('ADAPTIVE BARRIER · +15% DEFENSIVE ENERGY EFFICIENCY');
    expect(apex).toContain('THEATER MESH · ${frontAllocationPercent}% × ${activeFrontCount} FRONTS');
    expect(apex).toContain('EMPIRE-WIDE SHIELD NETWORK');
    expect(apex).toContain("((network?.attackMultiplier ?? 1) - 1) * 100");
    expect(apex).not.toContain('PULSE ATTACK');
    expect(apex).toContain('${totalProjectionBudgetPercent}% total grid budget');
    expect(apex).toContain('finance.apexContribution');
    expect(apex).not.toMatch(/DOME POWER|SHIELD INTEGRITY|SINGULARITY|MIRROR MATRIX|OMNIPRESENCE/);
    expect(apex).not.toMatch(/MOVE<\/button>|LASER|commander-order|APEX economy|TREASURY|UPKEEP|INVEST/);
  });

  it('shows EONSCAR contribution as Empire income and keeps costs categorized', () => {
    const economy = methodSource('  private renderEconomyPanel(', '  private renderResearchPanel(');
    expect(economy).toContain('finance.revenue + finance.apexContribution');
    expect(economy).toContain("label: 'EONSCAR CONTRIBUTION'");
    expect(economy).toContain('const totalExpenses = finance.expenses');
    expect(economy.indexOf('Annual income breakdown'))
      .toBeLessThan(economy.indexOf('Annual expense breakdown'));
    expect(economy).toContain('<span>TREASURY</span><strong>${cash(human.treasury)}</strong>');
    expect(economy).toContain('compact-ledger');
    expect(economy).toContain('Full annual ledger');
    expect(economy).not.toMatch(/APEX UPKEEP|APEX TREASURY|APEX INVESTMENT/);
  });

  it('projects one-day recurring values across a 365-day display year', () => {
    expect(worldUiSource).toContain('V2_CALENDAR_DAYS_PER_YEAR,');
    expect(worldUiSource).toContain(
      'const annual = (daily: number): number => daily * V2_CALENDAR_DAYS_PER_YEAR;',
    );
    expect(worldUiSource).not.toContain('const WEEKS_PER_YEAR = 52;');
  });

  it('shows five parallel research categories with three pre-completion directions each', () => {
    const research = methodSource('  private renderResearchPanel(', '  private renderWarPanel(');
    const polar = methodSource('  private renderPolarResearchItem(', '  private renderPolarCompletedEffects(');
    expect(RESEARCH_CATEGORIES).toEqual(['people', 'army', 'combat', 'sustainment', 'state']);
    for (const category of RESEARCH_CATEGORIES) {
      expect(RESEARCH_CATEGORY_DIRECTIONS[category]).toHaveLength(3);
    }
    expect(research).toContain('${this.renderPolarResearchItem(human)}');
    expect(research).toContain('Research · Strategic Matrix');
    expect(research).toContain('AUTOMATIC EMPIRE PORTFOLIO');
    expect(research).toContain('Five directions develop in parallel');
    expect(research).toContain('FIVE PARALLEL CATEGORIES');
    expect(research).toContain('One active direction in every category · completion never pauses');
    expect(research).toContain('Completed levels apply immediately and the next level starts automatically');
    expect(research).toContain('WHAT POWERS YOUR RESEARCH');
    expect(research).toContain('ACTIVE PORTFOLIO · 80% CAP');
    expect(research).toContain('TOTAL IQ EFFECT');
    expect(research).toContain('IF FUNDED R&amp;D +');
    expect(research).toContain('next level in about ${activeDays} days');
    expect(research).toContain('RESEARCH_CATEGORY_DIRECTIONS[pillar.id].map');
    expect(research).toContain('data-action="set-research-direction"');
    expect(research).toContain('RESEARCH_PILLARS.map');
    expect(research).toContain('Special project lane <b>NORTH POLE</b>');
    expect(research).toContain('Completed effects');
    expect(research).not.toMatch(/BREAKTHROUGH READY|CHOICE READY|nothing is awarded automatically/i);
    expect(research).not.toContain('data-action="choose-research-breakthrough"');
    expect(research).not.toContain('data-action="set-research-focus"');
    expect(research).not.toContain('All research programs');
    expect(polar).toContain('this.engine.arcticProjectTerms(human.id, project.id)');
    expect(polar).toContain('project.benefits.join');
    expect(polar).toContain('data-action="start-arctic-project"');
    expect(polar).toContain('START ANALYSIS · ${cash(terms.cost)}');
    expect(polar).toContain('terms.durationTicks');
    expect(polar).not.toMatch(/20W|OPTIONAL INTELLIGENCE|OPEN INVESTIGATION/);
  });

  it('keeps territory inspection power-first and EONSCAR status read-only', () => {
    const territory = methodSource('  private renderTerritoryPanel(', '  private renderWarTracker(');
    const markup = territory.slice(territory.indexOf('    return `'));
    const terrainIndex = markup.indexOf('${terrainProfilePanel(');
    expect(markup.indexOf('${primaryWarAction}')).toBeLessThan(terrainIndex);
    expect(territory).toContain('COMBAT POWER</span>');
    expect(terrainIndex).toBeLessThan(markup.indexOf('SELECTED LAND'));
    expect(markup.indexOf('SELECTED LAND')).toBeLessThan(markup.indexOf('${ownerIntel}'));
    expect(territory).toContain('ACTIVE FRONT · EONSCAR SHIELD ONLINE');
    expect(territory).toContain('ACTIVE COUNTEROFFENSIVE');
    expect(territory).toContain('ROGUE FRONT · COUNTERATTACK');
    expect(territory).toContain('this.engine.survivalCounteroffensiveTargets(humanId).find');
    expect(territory).toContain('data-action="push-survival-front"');
    expect(territory).toContain('PUSH FRONT');
    expect(worldUiSource).toContain("case 'push-survival-front':");
    expect(worldUiSource).toContain('this.engine.selectSurvivalCounteroffensive(');
    expect(territory).not.toContain('FOCUS FRONT');
    expect(territory).not.toContain('commander-front-quick');
    expect(territory).toContain('SUPPLY CORRIDOR');
    expect(territory).toContain('TRANSIT ONLY');
    expect(territory).not.toMatch(/SEND APEX|commander-order/);
  });

  it('keeps Operation Review power-first with EONSCAR, route and recurring cost in one surface', () => {
    const review = methodSource('  private renderWarConfirmation(', '  private renderSurrenderConfirmation(');
    for (const label of [
      'YOUR TOTAL POWER', 'ENEMY POWER', 'WIN CHANCE',
      'WAR SUPPLY', 'PREPARATION', 'OPERATION COST',
      'YOUR FRONT SOLDIERS', 'ENEMY FRONT SOLDIERS', 'FIRST BATTLE ESTIMATE',
      'EMPIRE EXPANSION YIELD', 'GDP ON CAPTURE', 'GDP AFTER PURGE', 'IQ AFTER PURGE',
      'START OPERATION',
    ]) expect(review).toContain(label);
    expect(review).toContain('ownTotalPower = ownPower * (1 + apexSupportBonus / 100)');
    expect(review).toContain('EONSCAR +${format(apexSupportBonus, 1)}%');
    expect(review).toContain('EONSCAR UNAVAILABLE');
    expect(review).toContain('review-apex-contribution');
    expect(review).toContain('apexForecast.supportBonusPercent');
    expect(review).not.toMatch(/ownPower \+ apexPower|INCLUDES \+\$\{compactNumber\(apexPower\)\} APEX/);
    expect(review).toContain('logisticsPreview.additionalWeeklyWarOperations');
    expect(review).toContain('${cash(logisticsPreview.additionalWeeklyWarOperations)} / day');
    expect(review).toContain('annual(logisticsPreview.additionalWeeklyWarOperations)');
    expect(review).toContain('<strong>${mobilizationWeeks} DAYS</strong>');
    expect(review).toContain('ARRIVES D${apexForecast.etaWeeks}');
    expect(review).toContain('criticalRisks.slice(0, 3)');
    expect(review).toContain('aria-label="Power and win chance"');
    expect(review).toContain('aria-label="Exact combat detail"');
    expect(review).toContain('data-action="cancel-war"');
    expect(review).toContain('data-action="declare-war"');
    expect(review).not.toMatch(/CONQUEST VALUE|EMPIRE FUSION|SIGNAL PURGE|POLITICAL SUSPICION|COALITION|REVOLT|PROPAGANDA/);
    expect(review).not.toMatch(/START NAVAL WAR|START WAR/);
  });

  it('keeps Operation Review readable and responsive without desktop scrolling', () => {
    for (const selector of [
      '.world-ui-v2 .review-power-decision',
      '.world-ui-v2 .review-operation-facts',
      '.world-ui-v2 .review-combat-detail',
      '.world-ui-v2 .review-critical-risks',
    ]) expect(stylesSource).toContain(selector);
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr) 180px minmax(0, 1fr);');
    expect(stylesSource).toContain('.world-ui-v2 .review-action-footer > button { font-size: 12px; }');
    expect(stylesSource).toContain('@media (max-width: 480px)');
  });

  it('keeps one compact decision row per bilateral war', () => {
    const tracker = methodSource('  private renderWarTracker(', '  private renderRankingPanel(');
    for (const label of ['ACTIVE WARS', 'YOU', 'ENEMY', 'SCORE', 'LOSSES', 'ETA']) {
      expect(tracker).toContain(label);
    }
    expect(tracker).toContain('war-command-conflicts');
    expect(tracker).toContain('war-command-conflict');
    expect(tracker).toContain('war-command-conflict__power');
    expect(tracker).toContain('combinedOwnPower');
    expect(tracker).toContain('Your combined Power');
    expect(tracker).toContain('Combined Power balance');
    expect(tracker).toContain('${wars.map((war) => {');
    expect(tracker).toContain('EONSCAR GRID ${Math.round(networkFront!.allocationShare * 100)}%');
    expect(tracker).toContain('combinedOwnPower = own.power * (1 + assignedSupportPercent / 100)');
    expect(tracker).toContain('+${format(assignedSupportPercent, 1)}% ARMY');
    expect(tracker).not.toContain('assignedCommanderPower');
    expect(tracker).not.toMatch(/APEX ETA|APEX TWIN|60% ·|SHARED SHIELD/);
    expect(tracker).toContain('aria-label="Open war with');
    expect(tracker).not.toContain('data-action="request-ceasefire"');
    expect(tracker).not.toMatch(/COMBAT POWER|CUMULATIVE LOSSES|ACTIVE ARMY|ACTIVE FRONTS|FOCUS LEAD FRONT|REQUEST PEACE|war-command-campaign|war-command-fronts|frontRows|CHOOSE EXACT FRONT|CLICK TO CHECK ROUTE|commander-order|SEND APEX/);
  });

  it('anchors Active Wars directly below the current topbar at every breakpoint', () => {
    const trackerStylesStart = stylesSource.indexOf(
      '.world-ui-v2 .war-command-overlay.war-tracker--compact {',
    );
    const trackerStylesEnd = stylesSource.indexOf(
      '/* Compact live conflicts:',
      trackerStylesStart,
    );
    const trackerStyles = stylesSource.slice(trackerStylesStart, trackerStylesEnd);
    expect(trackerStyles).toContain('top: 84px;');
    expect(trackerStyles).toContain('max-height: min(300px, calc(100dvh - 216px));');
    expect(trackerStyles).not.toMatch(/top:\s*(?:168|206|258)px/);

    const compactTopbarStart = stylesSource.lastIndexOf(
      '@media (max-width: 900px)',
      stylesSource.indexOf('.world-ui-v2 .unified-topbar.command-topbar.v2-topbar'),
    );
    const compactTopbarStyles = stylesSource.slice(
      compactTopbarStart,
      stylesSource.indexOf('@media (max-width: 520px)', compactTopbarStart),
    );
    expect(compactTopbarStyles).toContain('.world-ui-v2 .war-tracker { top: 132px !important; }');
  });

  it('contains no retired political or manual-EONSCAR controls', () => {
    expect(worldUiSource).not.toMatch(/POLITICAL SUSPICION|WORLD HOSTILITY|REVOLT RISK|CONTAINMENT ACTIVE|RIVALS MOBILISING/);
    expect(worldUiSource).not.toMatch(/data-action="commander-order"|data-action="focus-apex-front"|SEND APEX HERE|FOCUS \+ SEND APEX/);
    expect(worldUiSource).not.toMatch(/launch-propaganda|PROPAGANDA/);
    expect(worldUiSource).not.toMatch(/WarStrain|WAR STRAIN|FRONTLINE STABILITY|war-strain|war-pressure/);
    expect(stylesSource).not.toMatch(/simple-suspicion|nation-reaction-block|war-pressure__revolt/);
  });

  it('keeps live decision labels at least 11px with overflow guards', () => {
    expect(stylesSource).toContain('.world-ui-v2 .command-drawer--decision :where(small, p, em)');
    expect(stylesSource).toContain('.world-ui-v2 .war-command-conflict__power small');
    expect(stylesSource).toContain('.world-ui-v2 .commander-control__metrics small');
    expect(stylesSource).toContain('font-size: 11px !important;');
    expect(stylesSource).toContain('text-overflow: ellipsis;');
    expect(stylesSource).toContain('white-space: nowrap;');
  });

  it('preserves drawer scroll sessions during live updates', () => {
    expect(worldUiSource).toContain('this.scrollSessions,');
    expect(worldUiSource).toContain("addEventListener('wheel', this.onHudScrollIntent");
    expect(worldUiSource).toContain("addEventListener('scroll', this.onHudScrollIntent");
    expect(worldUiSource).toContain('scrollInteractionUntil - performance.now()');
  });
});
