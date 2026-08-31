import { describe, expect, it } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';

function methodSource(start: string, end: string): string {
  const from = worldUiSource.indexOf(start);
  const until = worldUiSource.indexOf(end, from);
  expect(from).toBeGreaterThan(0);
  expect(until).toBeGreaterThan(from);
  return worldUiSource.slice(from, until);
}

describe('BEST TARGET forecast route identity', () => {
  it('uses the exact forecast front for ranking, card access and distance', () => {
    const recommendations = methodSource(
      '  private warTargetRecommendations(',
      '  private connectedOpponentIds(',
    );

    expect(recommendations).toContain('const distanceKm = forecast.routeDistanceKm ??');
    expect(recommendations).toContain('access: forecast.access');
    expect(recommendations).toContain('forecast.routeThroughputMultiplier');
    expect(recommendations).not.toContain('access: declaration.access');
  });

  it('reuses the frozen forecast in review and still presents one percentage', () => {
    const card = methodSource(
      '  private renderTargetRecommendation(',
      '  private renderWarCard(',
    );
    const review = methodSource(
      '  private renderWarConfirmation(',
      '  private renderGameOver(',
    );

    expect(card).toContain('${format(candidate.chance, 1)}% WIN');
    expect(review).toContain('const forecast = cachedTarget?.forecast ??');
    expect(review).toContain("const navalLogistics = forecast.access === 'naval'");
    expect(review).toContain('forecast.routeDistanceKm ?? logisticsPreview?.distanceKm');
    expect(review).toContain('const chance = forecast.winChance');
  });
});
