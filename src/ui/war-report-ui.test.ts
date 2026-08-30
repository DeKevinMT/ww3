import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function warReportSource(): string {
  const start = worldUiSource.indexOf('  private renderWarOutcome(');
  const end = worldUiSource.indexOf('  private renderGameOver(', start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return worldUiSource.slice(start, end);
}

describe('power-first War Report', () => {
  it('puts outcome and Nation Power before every supporting statistic', () => {
    const report = warReportSource();
    const markup = report.slice(report.indexOf('return `'));
    expect(report).toContain('role="dialog"');
    expect(report).toContain('aria-modal="true"');
    expect(report).toContain('aria-labelledby=');
    expect(report).toContain('aria-describedby=');
    expect(markup.indexOf('NATION POWER')).toBeLessThan(markup.indexOf('LOSSES'));
    expect(markup.indexOf('NATION POWER')).toBeLessThan(markup.indexOf('TERRITORY'));
    expect(report).toContain('DURATION');
    expect(report).toContain('BATTLES');
    expect(report).toContain('FRONT SCORE');
  });

  it('reports factual APEX battle support rather than current-force estimates', () => {
    const report = warReportSource();
    for (const field of [
      'apexSupportedBattles',
      'apexPeakPower',
      'apexMaxIntegrity',
      'apexLosses',
      'apexSupplyDelivered',
      'apexSupplySpent',
      'apexSingularityPulses',
      'apexMirrorCounterpulseDamage',
      'apexTwinProjectionBattles',
    ]) expect(report).toContain(`outcome.${field}`);
    expect(report).toContain('PEAK +${compactNumber(outcome.apexPeakPower)} DOME POWER');
    expect(report).toContain('Math.min(100');
    expect(report).toContain('SHIELD DAMAGE −${format(apexIntegrityDamage, 1)}%');
    expect(report).toContain('SHIELD DEPLETED');
    expect(report).toContain('APEX SHIELD');
    expect(report).toContain('ENERGY ${format(apexSupplyCoverage, 0)}%');
    expect(report).toContain('SINGULARITY PULSE ×${outcome.apexSingularityPulses}');
    expect(report).toContain('MIRROR COUNTERPULSE −${people(outcome.apexMirrorCounterpulseDamage ?? 0)} HOSTILE');
    expect(report).toContain('60% + 60% SHARED SHIELD');
    expect(report).toContain('SHIELD NOT PRESENT ON THIS FRONT');
    expect(report).not.toContain('state.commanderForces');
  });

  it('keeps territory and losses readable while moving depth behind one disclosure', () => {
    const report = warReportSource();
    for (const label of [
      'CAPTURED', 'LOST', 'YOU', 'ENEMY',
      'ATTACK RATING', 'DEFENCE RATING', 'ARMY LIMIT',
      'TERRITORY PEOPLE', 'TERRITORY OUTPUT', 'TREASURY',
    ]) expect(report).toContain(label);
    expect(report).toContain('<details class="war-report__details" data-disclosure-session=');
    expect(report).toContain('<summary>FULL BREAKDOWN</summary>');
    expect(report).not.toMatch(/TERRITORIAL POPULATION|MAX MANPOWER|EFFECTIVE ATK|live troops, condition|REVOLT|COALITION|FOCUS LEAD FRONT|REQUEST PEACE/i);
  });

  it('fits the first desktop view and retains compact mobile fallbacks', () => {
    expect(stylesSource).toContain('width: min(880px, calc(100vw - 32px));');
    expect(stylesSource).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(stylesSource).toContain('.world-ui-v2 .war-report__summary');
    expect(stylesSource).toContain('.world-ui-v2 .war-report__details');
    expect(stylesSource).toContain('@media (max-width: 760px)');
    expect(stylesSource).toContain('@media (max-width: 480px)');
    const reportCssStart = stylesSource.indexOf('/* One bilateral conflict produces one compact, power-first debrief. */');
    const reportCssEnd = stylesSource.indexOf('@media (max-width: 840px)', reportCssStart);
    const reportCss = stylesSource.slice(reportCssStart, reportCssEnd);
    expect(reportCss).not.toMatch(/font-size:\s*(?:8|9|10)px/);
  });
});
