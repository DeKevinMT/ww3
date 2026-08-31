import { describe, expect, it } from 'vitest';
import {
  rankWarTargetRecommendationsV2,
  warTargetFusionValueBonusV2,
  warTargetRecommendationScoreV2,
  warTargetRouteLabelV2,
  warTargetRoutePenaltyV2,
  type WarTargetRecommendationRankInputV2,
} from './warTargetRecommendations';

const routeCases: ReadonlyArray<{
  name: string;
  target: WarTargetRecommendationRankInputV2;
  penalty: number;
  score: number;
  label: string;
}> = [
  {
    name: 'adjacent land',
    target: { targetId: 'land', chance: 70, access: 'land', distanceKm: 0 },
    penalty: 0,
    score: 70,
    label: 'LAND BORDER',
  },
  {
    name: '2,000 km regional naval',
    target: { targetId: 'regional', chance: 70, access: 'naval', distanceKm: 2_000 },
    penalty: 7,
    score: 63,
    label: 'REGIONAL NAVAL · 2,000 KM',
  },
  {
    name: '6,500 km ocean expedition',
    target: { targetId: 'ocean', chance: 70, access: 'naval', distanceKm: 6_500 },
    penalty: 16,
    score: 54,
    label: 'OCEAN EXPEDITION · 6,500 KM',
  },
  {
    name: '12,000 km ocean expedition',
    target: { targetId: 'far-ocean', chance: 70, access: 'naval', distanceKm: 12_000 },
    penalty: 27,
    score: 43,
    label: 'OCEAN EXPEDITION · 12,000 KM',
  },
];

describe('best target route ranking', () => {
  it.each(routeCases)('$name has a transparent route score', ({ target, penalty, score, label }) => {
    expect(warTargetRoutePenaltyV2(target)).toBeCloseTo(penalty, 6);
    expect(warTargetRecommendationScoreV2(target)).toBeCloseTo(score, 6);
    expect(warTargetRouteLabelV2(target)).toBe(label);
  });

  it('ranks land, regional naval and progressively longer expeditions in that order', () => {
    const ranked = rankWarTargetRecommendationsV2(
      routeCases.map(({ target }) => target).reverse(),
    );

    expect(ranked.map((target) => target.targetId)).toEqual([
      'land', 'regional', 'ocean', 'far-ocean',
    ]);
  });

  it('keeps real naval distance strictly monotonic without a hard cutoff', () => {
    const distances = [2_000, 6_500, 12_000, 25_000];
    const penalties = distances.map((distanceKm) => warTargetRoutePenaltyV2('naval', distanceKm));

    expect(penalties).toEqual([7, 16, 27, 53]);
    expect(penalties.every(Number.isFinite)).toBe(true);
    expect(penalties.every((penalty, index) => index === 0 || penalty > penalties[index - 1]!))
      .toBe(true);
  });

  it('rewards a same-region route and an existing beachhead independently', () => {
    const baseline = {
      targetId: 'baseline', chance: 70, access: 'naval' as const, distanceKm: 6_500,
    };
    const sameRegion = { ...baseline, targetId: 'same-region', sameRegion: true };
    const beachhead = { ...baseline, targetId: 'beachhead', existingBeachhead: true };
    const both = {
      ...baseline,
      targetId: 'both',
      sameRegion: true,
      existingBeachhead: true,
    };

    expect([
      warTargetRecommendationScoreV2(baseline),
      warTargetRecommendationScoreV2(sameRegion),
      warTargetRecommendationScoreV2(beachhead),
      warTargetRecommendationScoreV2(both),
    ]).toEqual([54, 59, 61, 66]);
    expect(rankWarTargetRecommendationsV2([baseline, sameRegion, beachhead, both])
      .map((target) => target.targetId)).toEqual(['both', 'beachhead', 'same-region', 'baseline']);
    expect(warTargetRouteLabelV2(sameRegion)).toBe('REGIONAL NAVAL · 6,500 KM');
  });

  it('separates an unprepared expedition from an expedition-ready beachhead', () => {
    const lowReadiness = {
      targetId: 'low',
      chance: 82,
      access: 'naval' as const,
      distanceKm: 12_000,
      frontSupply: 0.2,
      transferThroughput: 0.15,
      stagingReadiness: 0.1,
      preparationWeeks: 8,
    };
    const expeditionReady = {
      targetId: 'ready',
      chance: 82,
      access: 'naval' as const,
      distanceKm: 12_000,
      existingBeachhead: true,
      frontSupply: 1,
      transferThroughput: 1,
      stagingReadiness: 1,
      etaWeeks: 1,
    };

    expect(warTargetRoutePenaltyV2(lowReadiness)).toBeCloseTo(45.9, 6);
    expect(warTargetRecommendationScoreV2(lowReadiness)).toBeCloseTo(36.1, 6);
    expect(warTargetRoutePenaltyV2(expeditionReady)).toBeCloseTo(11.65, 6);
    expect(warTargetRecommendationScoreV2(expeditionReady)).toBeCloseTo(70.35, 6);
    expect(warTargetRouteLabelV2(expeditionReady))
      .toBe('OCEAN EXPEDITION · 12,000 KM · ETA 1D');
  });

  it('lets an overwhelmingly safer expedition-ready target beat a nearby land target', () => {
    const nearby = { targetId: 'nearby', chance: 60, access: 'land' as const };
    const farReady = {
      targetId: 'far-ready',
      chance: 82,
      access: 'naval' as const,
      distanceKm: 12_000,
      existingBeachhead: true,
      frontSupply: 1,
      transferThroughput: 1,
      stagingReadiness: 1,
      etaWeeks: 1,
    };

    expect(rankWarTargetRecommendationsV2([nearby, farReady])[0]?.targetId).toBe('far-ready');
  });

  it('keeps conquest quality bounded and subordinate to route and safety', () => {
    const maximumFusion = warTargetFusionValueBonusV2({
      gdpPerCapitaThousands: 1_000,
      nationalIq: 200,
    });
    const valuable = {
      targetId: 'valuable', chance: 65, access: 'land' as const,
      gdpPerCapitaThousands: 1_000, nationalIq: 200,
    };
    const safer = {
      targetId: 'safer', chance: 70, access: 'land' as const,
      gdpPerCapitaThousands: 0, nationalIq: 0,
    };
    const regional = {
      targetId: 'regional', chance: 65, access: 'naval' as const, distanceKm: 2_000,
      gdpPerCapitaThousands: 1_000, nationalIq: 200,
    };

    expect(maximumFusion).toBe(4);
    expect(warTargetRecommendationScoreV2(valuable)).toBe(69);
    expect(rankWarTargetRecommendationsV2([valuable, safer])[0]?.targetId).toBe('safer');
    expect(warTargetRecommendationScoreV2(regional)).toBe(62);
  });

  it('preserves deterministic tie breaks, including invalid optional intel', () => {
    const ranked = rankWarTargetRecommendationsV2([
      { targetId: 'zulu', chance: Number.NaN, access: 'naval', distanceKm: Number.NaN },
      { targetId: 'alpha', chance: Number.NaN, access: 'naval', distanceKm: Number.NaN },
    ]);

    expect(ranked.map((target) => target.targetId)).toEqual(['alpha', 'zulu']);
    expect(warTargetRouteLabelV2('land', 0)).toBe('LAND BORDER');
    expect(warTargetRouteLabelV2('naval', 900)).toBe('REGIONAL NAVAL · 900 KM');
  });
});
