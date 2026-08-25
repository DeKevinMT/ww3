import { describe, expect, it, vi } from 'vitest';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { WORLD_CONTENT_V2 } from '../sim/v2/content';
import { humanStartingArmyMultiplierForContentV2 } from '../sim/v2/traits';
import { nationIdV2 } from '../sim/v2/types';
import {
  compareIntroNationMetricsV2,
  INTRO_SORT_OPTIONS,
  IntroOpeningMetricsCacheV2,
} from './WorldUIV2';

describe('intro opening metrics cache', () => {
  it('builds one bounded hypothetical-human batch and reuses it', () => {
    const engine = new WorldEngineV2(12_001);
    const preview = vi.spyOn(engine, 'openingCandidatePreviewSnapshot');
    const cache = new IntroOpeningMetricsCacheV2();
    const authoritativeState = structuredClone(engine.state);

    const first = cache.read(engine);
    for (let index = 0; index < 50; index += 1) expect(cache.read(engine)).toBe(first);

    expect(first.byNation.size).toBe(WORLD_CONTENT_V2.nationIds.length);
    expect(engine.state).toEqual(authoritativeState);
    expect(preview).toHaveBeenCalledTimes(1);

    engine.state.actionSequence += 1;
    expect(cache.read(engine)).not.toBe(first);
    expect(preview).toHaveBeenCalledTimes(2);

    engine.state.humanPlayerId = engine.state.humanPlayerId === 'bel' ? 'nld' : 'bel';
    cache.read(engine);
    expect(preview).toHaveBeenCalledTimes(3);
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

  it('offers one unambiguous pure military ranking choice', () => {
    expect(INTRO_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'power', 'aggressiveness', 'attack', 'defense', 'iq', 'manpower',
      'economy', 'gdp-per-capita', 'economic-growth', 'tax', 'population', 'growth',
    ]);
    expect(INTRO_SORT_OPTIONS[0]?.label).toBe('Military ranking');
  });

  it('sorts GDP per capita from the same neutral AI opening snapshot', () => {
    const engine = new WorldEngineV2(12_005);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const sorted = WORLD_CONTENT_V2.nationIds
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
      .sort((left, right) => compareIntroNationMetricsV2(left, right, 'gdp-per-capita', opening));
    const values = sorted.map((nation) => opening.byNation.get(nation.id)?.['gdp-per-capita'] ?? 0);

    expect(values).toEqual([...values].sort((left, right) => right - left));
    for (const metrics of opening.byNation.values()) {
      expect(metrics['gdp-per-capita']).toBe(metrics.economyView.wealthPerPerson / 1e6);
    }
  });

  it('sorts the country picker by the cached pure military rank', () => {
    const engine = new WorldEngineV2(12_003);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const sorted = WORLD_CONTENT_V2.nationIds
      .map((id) => WORLD_CONTENT_V2.nations[id])
      .filter((nation): nation is NonNullable<typeof nation> => Boolean(nation))
      .sort((left, right) => compareIntroNationMetricsV2(left, right, 'power', opening));
    const sortedPower = sorted.map((nation) => opening.byNation.get(nation.id)?.power ?? 0);

    expect(sortedPower).toEqual([...sortedPower].sort((left, right) => right - left));
    for (const metrics of opening.byNation.values()) {
      expect(metrics.power).toBe(metrics.combatPower);
      expect(metrics.military).toBe(metrics.combatPower);
    }
    for (const entry of opening.ranking) {
      expect(entry.score).toBe(entry.combatPower);
      expect(entry.combatPower).toBe(opening.byNation.get(entry.player.id)?.combatPower);
    }
  });

  it('keeps Greenland stats and ranking at the neutral AI baseline', () => {
    const greenland = nationIdV2('grl');
    const engine = new WorldEngineV2(12_004);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const preview = opening.byNation.get(greenland);
    expect(preview).toBeDefined();
    const baselineArmy = engine.armyStrength(greenland);
    const baselineMilitary = engine.militaryBaseSnapshot();
    const baselinePower = engine.powerSnapshot(baselineMilitary);
    expect(preview!.army).toEqual(baselineArmy);
    expect(preview!.combatPower).toBe(baselinePower.byNation.get(greenland));
    expect(opening.ranking.map((entry) => entry.player.id)).toEqual(
      engine.openingCandidatePreviewSnapshot().ranking.map((entry) => entry.player.id),
    );

    expect(engine.chooseCountry(greenland)).toEqual({ accepted: true });
    engine.stopClock();
    const actualArmy = engine.armyStrength(greenland);
    expect(actualArmy.capacity).toBeGreaterThan(preview!.army.capacity);
    expect(actualArmy.deployed).toBeCloseTo(
      preview!.army.deployed
        * humanStartingArmyMultiplierForContentV2(WORLD_CONTENT_V2, greenland),
      6,
    );
    expect(engine.currentPower(greenland)).toBeGreaterThan(preview!.combatPower);
  });
});
