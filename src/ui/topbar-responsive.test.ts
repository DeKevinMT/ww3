import { describe, expect, it } from 'vitest';
import stylesSource from '../styles.css?raw';
import worldUiSource from './WorldUIV2.ts?raw';

describe('responsive strategic topbar', () => {
  it('keeps six focused status shortcuts in a horizontally accessible mobile row', () => {
    expect(worldUiSource).toContain('grid-template-columns: repeat(6,minmax(96px,1fr)) !important');
    expect(worldUiSource).toContain('display: grid !important');
    expect(worldUiSource).toContain('overflow-x: auto !important');
    expect(worldUiSource).toContain('.command-topbar .command-identity { display: flex !important; }');
    expect(worldUiSource).toContain('.command-topbar .top-actions { display: flex !important; }');
    expect(worldUiSource).toContain('.top-metric--economy > span');
    expect(worldUiSource).toContain('.top-metric--treasury > span');
    expect(worldUiSource).toContain('.top-metric--military > span');
    expect(worldUiSource).toContain('.top-metric--people > span');
  });

  it('routes every status shortcut to its owning information domain', () => {
    const economy = worldUiSource.indexOf('class="top-metric top-metric--economy"');
    const treasury = worldUiSource.indexOf('<span>TREASURY</span>');
    const military = worldUiSource.indexOf('class="top-metric top-metric--military"');
    const people = worldUiSource.indexOf('class="top-metric top-metric--people"');
    const food = worldUiSource.indexOf('class="top-metric top-metric--food"');
    const research = worldUiSource.indexOf('class="top-metric top-metric--research"');

    expect(economy).toBeGreaterThan(0);
    expect(treasury).toBeGreaterThan(economy);
    expect(military).toBeGreaterThan(treasury);
    expect(people).toBeGreaterThan(military);
    expect(food).toBeGreaterThan(people);
    expect(research).toBeGreaterThan(food);
    expect(worldUiSource).not.toContain('<span>APEX</span>');
    expect(worldUiSource).toContain('data-panel="research"');
    expect(worldUiSource).not.toContain('data-panel="progress"');
    expect(worldUiSource).toContain('<span>TREASURY</span><strong>${treasuryTopbar.value} <i class="${treasuryTopbar.reserveFillClassName}">${treasuryTopbar.reserveFill} TARGET</i></strong>');
    expect(worldUiSource).toContain('finance.reserveTarget');
    expect(worldUiSource).toContain('Cashflow ${signedCash(annual(displayedNet))}/yr');
    expect(worldUiSource).toContain('<span>MILITARY · RES</span><strong>${format(army.fillRatio * 100)}% · R ${people(human.trainedReserves)}</strong>');
    expect(worldUiSource).toContain('power · PRIORITY ${human.budget.military}%');
    expect(worldUiSource.match(/title="[^"]+" aria-label="Open (?:Economy|War|Nation|Research)/g)).toHaveLength(6);
    expect(worldUiSource).toContain('trained reserves ${people(human.trainedReserves)} of ${people(finance.trainedReserveCapacity)} capacity');
    expect(worldUiSource).toContain('(1 + finance.annualEconomyGrowthRate)');
    expect(worldUiSource).toContain('/ Math.max(0.01, 1 + populationDynamics.annualNetRate)');
    expect(worldUiSource).toContain('${cash(economy.wealthPerPerson / 1e6)}/person ${signed(topbarGdpPerCapitaAnnualGrowth * 100, 2)}%');
    expect(worldUiSource).toContain('${cash(economy.controlledOutput)} <i class="${finance.annualEconomyGrowthRate >= 0');
    expect(worldUiSource).toContain('${signed(finance.annualEconomyGrowthRate * 100, 2)}%</i></strong>');
    expect(worldUiSource).toContain("finance.annualEconomyGrowthRate >= 0 ? 'is-positive' : 'is-negative'");
    expect(worldUiSource).toContain('${population(integratedPopulation)} <i class="${populationDynamics.annualNetRate >= 0');
    expect(worldUiSource).toContain('${signed(populationDynamics.annualNetRate * 100, 2)}%</i></strong><small><b>IQ ${format(topbarIq.score, 1)}</b></small>');
  });

  it('updates conquest totals directly without resource-flight DOM work', () => {
    expect(worldUiSource).not.toContain('playConquestTransfer');
    expect(worldUiSource).not.toContain('conquestTransferTimers');
    expect(worldUiSource).not.toContain('clearConquestTransferEffects');
    expect(worldUiSource).not.toContain('conquest-transfer-chip');
    expect(worldUiSource).not.toContain('is-receiving-gain');
    expect(worldUiSource).not.toContain('data-stat-target');
    expect(stylesSource).not.toContain('.conquest-transfer-chip');
    expect(stylesSource).not.toContain('.is-receiving-gain');
    expect(stylesSource).not.toContain('[data-stat-target]');
    expect(worldUiSource).toContain("this.scheduleRender(change.reason === 'conquest' ? 0 : (atWar ? 620 : 1_050));");
    expect(worldUiSource).toContain('void worldGameAudio.handleWorldChange(change, audioPresentation);');
    expect(worldUiSource).toContain('mapBridge.scene?.playBattle(change.battle);');
    expect(worldUiSource).toContain('and conquered its land · now rank #');
  });
});
