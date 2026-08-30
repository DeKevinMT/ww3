import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('Logistics Readiness UI contract', () => {
  it('keeps the topbar actionable and honest in peace and across multiple fronts', () => {
    expect(worldUiSource).toContain("? 'IDLE'");
    expect(worldUiSource).toContain('WEAK ${logisticsReadiness.weakest?.percent');
    expect(worldUiSource).toContain('<span>LOGISTICS</span>');
    expect(worldUiSource).not.toContain('<small>${escapeHtml(logisticsDetail)}</small>');
    expect(worldUiSource).toContain('class="topbar-progress-bar" role="progressbar" aria-label="Logistics readiness"');
    expect(worldUiSource).toMatch(/top-metric--logistics[\s\S]*data-panel="war"/);
  });

  it('shows overall, weakest and per-front combat-supply facts in War', () => {
    const panel = methodSource('  private renderWarPanel(', '  private warTargetRecommendations(');
    const card = methodSource('  private renderWarCard(', '  private renderTerritoryPanel(');
    expect(panel).toContain('logisticsReadiness: EmpireLogisticsReadinessV2');
    expect(worldUiSource.match(/selectEmpireLogisticsReadinessV2\(/g)).toHaveLength(1);
    expect(panel).toContain('${logisticsReadiness.percent}% ${logisticsReadiness.statusLabel}');
    expect(panel).toContain('weakest ${logisticsReadiness.weakest?.percent');
    expect(card).toContain("'WEAKEST LOGISTICS' : 'LOGISTICS'");
    expect(card).toContain('${frontLogistics.percent}% ${frontLogistics.statusLabel}');
    expect(card).toContain('${frontLogistics.routeLabel}');
    expect(card).toContain('${frontLogistics.limitingReason}');
    expect(card).toContain('NEXT BATTLE ${frontLogistics.nextBattleWeeks}W');
  });

  it('gives targets and Operation Review one non-duplicated route/readiness explanation', () => {
    const target = methodSource(
      '  private renderTargetRecommendation(',
      '  private renderWarCard(',
    );
    const review = methodSource(
      '  private renderWarConfirmation(',
      '  private cachedWarLogisticsPreview(',
    );
    expect(target).toContain('LOGISTICS ${readiness.percent}% ${readiness.statusLabel}');
    expect(target).toContain('${escapeHtml(readiness.limitingReason)}');
    expect(target.match(/LOGISTICS \$\{/g)).toHaveLength(1);
    expect(review).toContain('<span>LOGISTICS READINESS</span>');
    expect(review).toContain('${reviewLogistics.percent}% ${reviewLogistics.statusLabel}');
    expect(review).toContain('${escapeHtml(reviewLogistics.limitingReason)}');
    expect(review).toContain('NAVAL ROUTE');
    expect(review).toContain('LAND ROUTE');
    const reviewReadinessStart = review.indexOf(
      'const reviewLogistics = presentLogisticsReadinessV2(',
    );
    const reviewReadinessCall = review.slice(
      reviewReadinessStart,
      review.indexOf(');', reviewReadinessStart) + 2,
    );
    expect(reviewReadinessCall).toContain('forecast.attackerStrength > 0.000000001');
    expect(reviewReadinessCall).not.toContain('forecast.supportingForces > 0');
  });

  it('reuses one authoritative forecast, logistics quote and live estimate per render', () => {
    const recommendations = methodSource(
      '  private warTargetRecommendations(',
      '  private connectedOpponentIds(',
    );
    const connected = methodSource(
      '  private connectedOpponentIds(',
      '  private renderTargetRecommendation(',
    );
    const target = methodSource(
      '  private renderTargetRecommendation(',
      '  private renderWarCard(',
    );
    const card = methodSource('  private renderWarCard(', '  private renderTerritoryPanel(');
    const tracker = methodSource('  private renderWarTracker(', '  private renderRankingPanel(');
    const preview = methodSource(
      '  private cachedWarLogisticsPreview(',
      '  private renderSurrenderConfirmation(',
    );

    expect(recommendations).toContain('forecast,');
    expect(target).toContain('const battleForecast = candidate.forecast;');
    expect(target).not.toContain('this.engine.warForecast(');
    expect(connected).not.toContain('.warAccessType(');
    expect(card).not.toContain('this.engine.liveWarEstimate(');
    expect(card).not.toContain('this.humanWars()');
    expect(tracker).not.toContain('this.engine.liveWarEstimate(');
    expect(worldUiSource.match(/this\.engine\.liveWarEstimate\(/g)).toHaveLength(1);
    expect(worldUiSource).toContain('new Map<string, WarLogisticsPreviewV2>()');
    expect(preview).toContain('this.warLogisticsPreviewCache.clear()');
  });
});
