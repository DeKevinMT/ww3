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

describe('command UI information architecture', () => {
  it('keeps exactly four named command tabs', () => {
    const dock = worldUiSource.slice(
      worldUiSource.indexOf('<nav class="command-dock'),
      worldUiSource.indexOf('</nav>', worldUiSource.indexOf('<nav class="command-dock')),
    );
    expect(dock.match(/data-panel=/g)).toHaveLength(4);
    expect(dock).toContain('<b>WAR</b>');
    expect(dock).toContain('<b>NATION</b>');
    expect(dock).toContain('<b>RESEARCH</b>');
    expect(dock).toContain('<b>ECONOMY</b>');
    expect(dock).not.toContain('PROGRESS');
  });

  it('places military strength and unique peace actions in War without duplicate war cards', () => {
    const panel = methodSource('  private renderWarPanel(', '  private warTargetRecommendations(');
    expect(panel).toContain('renderMilitaryCommandOverview');
    expect(panel).toContain('TREATY OPTIONS');
    expect(panel).toContain('BEST AVAILABLE TARGETS');
    expect(panel.indexOf('this.renderAntarcticaGatewayCard()'))
      .toBeGreaterThan(panel.indexOf('BEST AVAILABLE TARGETS'));
    expect(panel).not.toContain('renderWarCard(');
    expect(worldUiSource).toContain('data-action="peace-settlement"');
    expect(worldUiSource).toContain('data-action="request-ceasefire"');
  });

  it('shows annual funded and required upkeep money before the separate readiness ratio', () => {
    const military = methodSource(
      '  private renderMilitaryCommandOverview(',
      '  private renderWarDiplomacyRow(',
    );
    const upkeepRowStart = military.indexOf("readinessRow('UPKEEP FUNDED'");
    const upkeepRow = military.slice(upkeepRowStart, military.indexOf('\n', upkeepRowStart));
    expect(upkeepRow).toContain('cash(annual(finance.fundedArmyUpkeep))');
    expect(upkeepRow).toContain('cash(annual(finance.armyUpkeep))');
    expect(upkeepRow).toContain("'funded / required each year'");
    expect(upkeepRow).not.toContain('format(upkeepReady * 100');
    expect(military).toContain('<b>${format(ratio * 100, 0)}%</b>');
    expect(military).toContain('clamp(finance.mandatoryFundingRatio, 0, 1.25)');
    expect(military).toContain("upkeepReady >= 0.999 ? 'is-good' : 'is-warn', 1.25");
    expect(military).toContain('clamp(ratio / ratioMax, 0, 1)');
  });

  it('keeps Nation domestic and Research research-only', () => {
    const nation = methodSource('  private renderNationPanel(', '  private renderEconomyPanel(');
    const research = methodSource('  private renderResearchPanel(', '  private renderWarPanel(');
    expect(nation).toContain('PEOPLE & FOOD');
    expect(nation).toContain('INTEGRATION');
    expect(nation).toContain('EMPIRE FUSION &amp; INTEGRATION');
    expect(nation).toContain('nation-fusion-progress');
    expect(nation).toContain('fusionOriginMix');
    expect(nation).not.toContain('nation-integration-overview');
    expect(nation).toContain('WORLD REACTION');
    expect(nation.indexOf('${traitPresentation}')).toBeGreaterThan(nation.indexOf('WORLD REACTION'));
    expect(nation).not.toContain('NATIONAL STRENGTH');
    expect(research).toContain('NEXT BREAKTHROUGH');
    expect(research).toContain('ACTIVE EFFECTS');
    expect(research).toContain('PROGRAMS');
    expect(research).not.toContain('TOTAL RESEARCH');
  });

  it('shows gross income above gross expenses and no domestic overview in Economy', () => {
    const economy = methodSource('  private renderEconomyPanel(', '  private renderResearchPanel(');
    expect(economy.indexOf('INCOME BREAKDOWN')).toBeLessThan(economy.indexOf('EXPENSE BREAKDOWN'));
    expect(economy).toContain('finance.revenue + finance.foodExportIncome + finance.ceasefireIncome');
    expect(economy).toContain('const totalExpenses = finance.expenses');
    expect(economy).toContain("weekly: Math.max(0, finance.foodProduction)");
    expect(economy).toContain('<span>TREASURY</span><strong class=');
    expect(economy).toContain('${cash(human.treasury)}</strong>');
    expect(economy).toContain("human.treasury > 0 ? 'is-positive' : human.treasury < 0 ? 'is-negative'");
    expect(economy).toContain('<h2>Financial overview</h2>');
    expect(economy).not.toContain('<h2>${cash(human.treasury)}</h2>');
    expect(economy).not.toContain('<span>NEXT WEEK</span>');
    expect(economy).not.toContain('INTEGRATED PEOPLE');
    expect(economy).not.toContain('FOOD SECURITY');
  });

  it('preserves independent drawer and nested scroll sessions during live updates', () => {
    expect(worldUiSource).toContain('this.scrollSessions,');
    expect(worldUiSource).toContain("addEventListener('wheel', this.onHudScrollIntent");
    expect(worldUiSource).toContain("addEventListener('scroll', this.onHudScrollIntent");
    expect(worldUiSource).toContain('scrollInteractionUntil - performance.now()');
    expect(worldUiSource).toContain('data-scroll-session="${isLobby ? \'lobby\' : \'intro\'}:country-preview:${preview.id}"');
  });

  it('derives the complete peace lock wording from live treaty durations', () => {
    const peaceCard = methodSource('  private renderPeaceOfferCard(', '  private renderTerritoryPanel(');
    const peaceBanner = methodSource('  private renderOfferBanner(', '  private renderAllianceOfferBanner(');
    const confirmation = methodSource('  private renderCeasefireConfirmation(', '  private renderWarOutcome(');
    for (const surface of [peaceCard, peaceBanner]) {
      expect(surface).toContain('ceasefireDuration?.postPaymentTruceTicks');
      expect(surface.toLowerCase()).toContain('protected peace');
      expect(surface).not.toMatch(/104W|104w/);
    }
    expect(confirmation).toContain('terms.paymentWeeks');
    expect(confirmation).toContain('terms.truceTicks');
    expect(confirmation).toContain('terms.postPaymentTruceTicks');
    expect(confirmation).not.toContain('following year');
  });

  it('orders the territory inspector from terrain and land to owner intel and actions', () => {
    const territory = methodSource('  private renderTerritoryPanel(', '  private winChance(');
    const markup = territory.slice(territory.indexOf('    return `'));
    const terrainPanelIndex = markup.indexOf('${terrainProfilePanel(');
    expect(markup.indexOf('${primaryWarAction}')).toBeLessThan(terrainPanelIndex);
    expect(territory).toContain('territory-target-power');
    expect(territory).toContain('COMBAT POWER</span>');
    expect(terrainPanelIndex).toBeLessThan(markup.indexOf('SELECTED LAND'));
    expect(markup.indexOf('SELECTED LAND')).toBeLessThan(markup.indexOf('${ownerIntel}'));
    expect(markup.indexOf('${ownerIntel}')).toBeLessThan(markup.indexOf('territory-action-stack'));
    expect(territory).toContain('OWNER INTEL');
    expect(territory).toContain('data-action="clear-territory"');
    expect(territory).toContain('data-action="quick-war"');
    expect(territory).toContain('data-action="propose-alliance"');
    expect(territory).toContain('data-action="respond-alliance"');
  });

  it('keeps Review Attack decision-first and preserves both exit actions', () => {
    const review = methodSource('  private renderWarConfirmation(', '  private renderCeasefireConfirmation(');
    expect(review).toContain('review-attack-modal');
    expect(review).toContain('TARGET COMBAT POWER');
    expect(review).toContain('CAMPAIGN WIN CHANCE');
    expect(review).toContain('ATTACK VS DEFENCE');
    expect(review).toContain('review-combat-matchups');
    expect(review).toContain('OUR ATTACK → THEIR DEFENCE');
    expect(review).toContain('THEIR ATTACK → OUR DEFENCE');
    expect(review).toContain("forecast.access !== 'none'");
    expect(review).toContain("'SEA ROUTE' : 'ROUTE'");
    expect(review).toContain("logisticsPreview.distanceKm === undefined ? 'DISTANCE UNKNOWN'");
    expect(review).toContain('EXPECTED RECURRING WAR COST');
    expect(review).toContain('ADDED EACH WEEK');
    expect(review).toContain('TOTAL WAR OPERATIONS');
    expect(review).toContain('CASHFLOW AFTER START');
    expect(review).toContain('projectedAnnualCashflow');
    expect(review).toContain('treasuryCoverWeeks');
    expect(review).toContain('% distance premium');
    expect(review).toContain('and traits included');
    expect(review).toContain("'START NAVAL WAR' : 'START WAR'");
    expect(review).toContain("cash(logisticsPreview.additionalWeeklyWarOperations)}/WK");
    expect(review).not.toContain(' · FREE');
    expect(review).not.toContain('SUPPLY · LOAD');
    expect(review).not.toContain('<span>OUR POWER</span>');
    expect(review).not.toContain('TOTAL CAMPAIGNS');
    expect(review).not.toContain('review-logistics__limits');
    expect(review).not.toContain('war-rule-note is-warning');
    expect(review).not.toContain('war-rule-note is-blocked');
    expect(review).not.toContain('const weakArmy');
    expect(review).not.toContain('const warning');
    expect(review).toContain("declaration.reason ?? 'Attack requirements are not met.'");
    expect(review).toContain('CONQUEST VALUE');
    expect(review).toContain('conquestEconomyImpact');
    expect(review).toContain('conquestPopulationImpact');
    expect(review).toContain('cash(gains.retainedEconomy)');
    expect(review).toContain('population(gains.retainedPopulation)');
    expect(review).toContain('projectNationalIqFusionV2');
    expect(review).toContain('EMPIRE FUSION');
    expect(review).toContain('At full core:');
    expect(review).toContain('army quality');
    expect(review).toContain('GDP / PERSON');
    expect(review).toContain('projectedFusionGdpPerPerson');
    expect(review).toContain('gains.retainedEconomy');
    expect(review).toContain('gains.retainedPopulation');
    expect(review).not.toContain('<span>IQ</span>');
    expect(review).not.toContain('GDP / CAPITA');
    expect(review).toContain('review-action-footer');
    expect(review).toContain('data-action="cancel-war"');
    expect(review).toContain('data-action="declare-war"');
    expect(stylesSource).toContain('.review-logistics__grid');
    expect(stylesSource).toContain('.review-combat-matchups');
    expect(stylesSource).toContain('.review-logistics__grid > article.is-affordable.is-negative');
    expect(stylesSource).not.toContain('review-naval-logistics__load');
  });

  it('keeps map war overlays actionable and pressure information compact', () => {
    const command = methodSource('  private renderWarTracker(', '  private renderRankingPanel(');
    const pressure = methodSource('  private renderWarStrainMeter(', '  private renderEventTicker(');
    expect(command).toContain('war-command-campaign');
    expect(command).toContain('ARMY REMAINING');
    expect(command).toContain('CUMULATIVE LOSSES');
    expect(command).toContain('data-action="focus-war"');
    expect(command).toContain('data-action="request-ceasefire"');
    expect(pressure).toContain('war-pressure__score');
    expect(pressure).toContain('expansionThreat.score');
    expect(pressure).toContain('POLITICAL SUSPICION');
    expect(pressure).toContain('0</b> NO AI WAR');
    expect(pressure).toContain('40</b> EXPOSED');
    expect(pressure).toContain('80</b> CRITICAL');
    expect(pressure).toContain('war-pressure__suspicion-track');
    expect(pressure).toContain('suspicionRiskPresentationV2(suspicion)');
    expect(pressure).toContain('this.engine.globalResistance().threat');
    expect(pressure).not.toContain('ATTACK RISK');
    expect(pressure).not.toContain('NEIGHBOR COUNTERATTACK');
    expect(pressure).toContain('REVOLT RISK');
    expect(pressure).toContain('INTEGRATION${exposedIntegrations === 1');
    expect(pressure).toContain('territoryIntegrationWarPressureRevolutionRiskV2');
    expect(pressure).not.toContain('ARMY READY');
    expect(pressure).not.toContain('RESERVE READY');
    expect(pressure).toContain('war-pressure__impact');
    expect(pressure).toContain('PEACETIME RECOVERY');
  });

  it('places the primary War Pressure bar directly above Political Suspicion', () => {
    const pressureGrid = stylesSource.slice(
      stylesSource.indexOf('.world-ui-v2 .war-pressure.war-strain-meter--standalone'),
      stylesSource.indexOf('.world-ui-v2 .war-pressure__head', stylesSource.indexOf('.world-ui-v2 .war-pressure.war-strain-meter--standalone')),
    );
    expect(pressureGrid.indexOf('"track track"')).toBeLessThan(
      pressureGrid.indexOf('"suspicion suspicion"'),
    );
  });

  it('keeps the smallest live-war labels legible without removing overflow guards', () => {
    expect(stylesSource).toContain('.war-pressure__metrics small');
    expect(stylesSource).toContain('font-size: 6.25px;');
    expect(stylesSource).toContain('.war-command-campaign__metrics small { font-size: 7px;');
    expect(stylesSource).toContain('.war-command-campaign__actions > button > small { opacity: .75; font-size: 7.5px; }');
    expect(stylesSource).toContain('text-overflow: ellipsis;');
    expect(stylesSource).toContain('white-space: nowrap;');
  });
});
