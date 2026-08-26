import { describe, expect, it } from 'vitest';
import {
  rankWarTargetRecommendationsV2,
  warTargetFusionValueBonusV2,
  warTargetRecommendationScoreV2,
  warTargetRouteLabelV2,
} from './warTargetRecommendations';

describe('best available target route ranking', () => {
  it('prefers the nearer target when forecasts are equal', () => {
    const ranked = rankWarTargetRecommendationsV2([
      { targetId: 'far', chance: 62, access: 'naval', distanceKm: 8_000 },
      { targetId: 'near', chance: 62, access: 'naval', distanceKm: 900 },
    ]);

    expect(ranked.map((target) => target.targetId)).toEqual(['near', 'far']);
  });

  it('still lets a materially better far target win', () => {
    const nearby = { targetId: 'nearby', chance: 64, access: 'land' as const, distanceKm: 0 };
    const far = { targetId: 'far', chance: 75, access: 'naval' as const, distanceKm: 14_000 };

    expect(warTargetRecommendationScoreV2(far)).toBeGreaterThan(
      warTargetRecommendationScoreV2(nearby),
    );
    expect(rankWarTargetRecommendationsV2([nearby, far])[0]?.targetId).toBe('far');
  });

  it('uses GDP per capita and IQ as a bounded fusion-value tie breaker', () => {
    const baseline = {
      targetId: 'baseline', chance: 60, access: 'land' as const, distanceKm: 0,
      gdpPerCapitaThousands: 12, nationalIq: 82,
    };
    const rich = {
      targetId: 'rich', chance: 60, access: 'land' as const, distanceKm: 0,
      gdpPerCapitaThousands: 100, nationalIq: 82,
    };
    const capable = {
      targetId: 'capable', chance: 60, access: 'land' as const, distanceKm: 0,
      gdpPerCapitaThousands: 12, nationalIq: 120,
    };

    expect(rankWarTargetRecommendationsV2([baseline, rich])[0]?.targetId).toBe('rich');
    expect(rankWarTargetRecommendationsV2([baseline, capable])[0]?.targetId).toBe('capable');
    expect(warTargetFusionValueBonusV2({
      gdpPerCapitaThousands: 1_000,
      nationalIq: 200,
    })).toBe(8);
  });

  it('keeps a materially safer campaign ahead of maximum fusion value', () => {
    const safer = {
      targetId: 'safer', chance: 75, access: 'land' as const, distanceKm: 0,
      gdpPerCapitaThousands: 0, nationalIq: 0,
    };
    const valuable = {
      targetId: 'valuable', chance: 65, access: 'land' as const, distanceKm: 0,
      gdpPerCapitaThousands: 1_000, nationalIq: 200,
    };

    expect(rankWarTargetRecommendationsV2([valuable, safer])[0]?.targetId).toBe('safer');
  });

  it('orders comparable land, short naval and long naval routes transparently', () => {
    const ranked = rankWarTargetRecommendationsV2([
      { targetId: 'ocean', chance: 60, access: 'naval', distanceKm: 8_000 },
      { targetId: 'coast', chance: 60, access: 'naval', distanceKm: 900 },
      { targetId: 'border', chance: 60, access: 'land', distanceKm: 0 },
    ]);

    expect(ranked.map((target) => target.targetId)).toEqual(['border', 'coast', 'ocean']);
    expect(warTargetRouteLabelV2('land', 0)).toBe('LAND BORDER');
    expect(warTargetRouteLabelV2('naval', 900)).toBe('SHORT NAVAL · 900 KM');
    expect(warTargetRouteLabelV2('naval', 8_000)).toBe('LONG NAVAL · 8,000 KM');
  });
});
