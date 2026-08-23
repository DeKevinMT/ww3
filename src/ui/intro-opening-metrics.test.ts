import { describe, expect, it, vi } from 'vitest';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import {
  compareIntroNationMetricsV2,
  INTRO_SORT_OPTIONS,
  IntroOpeningMetricsCacheV2,
} from './WorldUIV2';

describe('intro opening metrics cache', () => {
  it('builds one shared military/power/finance/ranking batch and reuses it', () => {
    const engine = new WorldEngineV2(12_001);
    const military = vi.spyOn(engine, 'militaryBaseSnapshot');
    const power = vi.spyOn(engine, 'powerSnapshot');
    const finance = vi.spyOn(engine, 'openingCandidateFinancePlans');
    const ranking = vi.spyOn(engine, 'globalRanking');
    const cache = new IntroOpeningMetricsCacheV2();

    const first = cache.read(engine);
    for (let index = 0; index < 50; index += 1) expect(cache.read(engine)).toBe(first);

    expect(first.byNation.size).toBe(WORLD_CONTENT_V2.nationIds.length);
    expect(military).toHaveBeenCalledTimes(1);
    expect(power).toHaveBeenCalledTimes(1);
    expect(finance).toHaveBeenCalledTimes(1);
    expect(ranking).toHaveBeenCalledTimes(1);

    engine.state.actionSequence += 1;
    expect(cache.read(engine)).not.toBe(first);
    expect(military).toHaveBeenCalledTimes(2);
    expect(power).toHaveBeenCalledTimes(2);
    expect(finance).toHaveBeenCalledTimes(2);
    expect(ranking).toHaveBeenCalledTimes(2);

    engine.state.humanPlayerId = engine.state.humanPlayerId === 'bel' ? 'nld' : 'bel';
    cache.read(engine);
    expect(military).toHaveBeenCalledTimes(3);
    expect(power).toHaveBeenCalledTimes(3);
    expect(finance).toHaveBeenCalledTimes(3);
    expect(ranking).toHaveBeenCalledTimes(3);
  });

  it('uses the same cached global rank order for the list and continent selection', () => {
    const engine = new WorldEngineV2(12_002);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const sorted = WORLD_CONTENT_V2.nationIds
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
      .sort((left, right) => compareIntroNationMetricsV2(left, right, 'power', opening))
      .map((nation) => nation.id);

    expect(sorted).toEqual(opening.ranking.map((entry) => entry.player.id));
  });

  it('keeps global rank and military power as distinct, clearly ordered choices', () => {
    expect(INTRO_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'power', 'military', 'aggressiveness', 'attack', 'defense', 'iq', 'manpower',
      'economy', 'economic-growth', 'tax', 'population', 'growth',
    ]);
    expect(INTRO_SORT_OPTIONS.find((option) => option.value === 'military')?.label).toBe('Military power');
  });

  it('sorts the country picker by cached military power without replacing global rank', () => {
    const engine = new WorldEngineV2(12_003);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const sorted = WORLD_CONTENT_V2.nationIds
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
      .sort((left, right) => compareIntroNationMetricsV2(left, right, 'military', opening));
    const sortedPower = sorted.map((nation) => opening.byNation.get(nation.id)?.military ?? 0);

    expect(sortedPower).toEqual([...sortedPower].sort((left, right) => right - left));
    for (const metrics of opening.byNation.values()) {
      expect(metrics.military).toBe(metrics.combatPower);
    }
  });
});
