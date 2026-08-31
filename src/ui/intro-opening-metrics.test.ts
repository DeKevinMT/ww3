import { describe, expect, it, vi } from 'vitest';
import worldUiSource from './WorldUIV2.ts?raw';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { isHumanSelectableNationV2, WORLD_CONTENT_V2 } from '../sim/v2/content';
import { humanStartingArmyMultiplierForContentV2 } from '../sim/v2/traits';
import { nationIdV2 } from '../sim/v2/types';
import {
  compareIntroNationMetricsV2,
  INTRO_SORT_OPTIONS,
  introMetricColorV2,
  introMetricPercentileV2,
  introRelativeStatSourcesV2,
  IntroOpeningMetricsCacheV2,
} from './WorldUIV2';

describe('intro opening metrics cache', () => {
  it('maps the worst, median and best neutral openings to red, orange and green', () => {
    const values = [10, 20, 30];
    expect(introMetricPercentileV2(10, values)).toBe(0);
    expect(introMetricPercentileV2(20, values)).toBe(0.5);
    expect(introMetricPercentileV2(30, values)).toBe(1);
    expect(introMetricPercentileV2(20, [20, 20, 20])).toBe(0.5);
    expect(introMetricColorV2(0)).toBe('rgb(239 109 103)');
    expect(introMetricColorV2(0.5)).toBe('rgb(240 173 98)');
    expect(introMetricColorV2(1)).toBe('rgb(110 211 155)');
  });

  it('colors displayed Army and Treasury from neutral raw sources only', () => {
    const previewStats = worldUiSource.slice(
      worldUiSource.indexOf('  const renderPreviewStats ='),
      worldUiSource.indexOf('  const query =', worldUiSource.indexOf('  const renderPreviewStats =')),
    );
    expect(worldUiSource).toContain('army: metrics.army.deployed');
    expect(worldUiSource).toContain('treasury: metrics.player.treasury');
    expect(previewStats).toContain("relativeStat('army'");
    expect(previewStats).toContain("relativeStat('treasury'");
    expect(previewStats).toContain('people(startingArmy)');
    expect(previewStats).not.toContain('startingTrainedReserve');
    expect(previewStats).not.toContain("relativeStat('aggressiveness'");
    expect(previewStats).not.toContain('AGGRESSIVENESS');
    expect(worldUiSource).toContain('data-intro-source="neutral-opening"');
    expect(worldUiSource).not.toContain('humanOpeningTrainedReserveTermsForContentV2(');
  });

  it('keeps the retired reserve field out of picker stats', () => {
    const engine = new WorldEngineV2(12_006);
    const opening = new IntroOpeningMetricsCacheV2().read(engine);
    const weakest = opening.ranking.at(-1);
    const candidate = weakest ? opening.byNation.get(weakest.player.id) : undefined;
    expect(candidate).toBeDefined();
    expect(candidate!.player.trainedReserves).toBe(0);
    expect(introRelativeStatSourcesV2(candidate!)).not.toHaveProperty('reserve');
  });
  it('builds one bounded hypothetical-human batch and reuses it', () => {
    const engine = new WorldEngineV2(12_001);
    const preview = vi.spyOn(engine, 'openingCandidatePreviewSnapshot');
    const cache = new IntroOpeningMetricsCacheV2();
    const authoritativeState = structuredClone(engine.state);

    const first = cache.read(engine);
    for (let index = 0; index < 50; index += 1) expect(cache.read(engine)).toBe(first);

    expect(first.byNation.size).toBe(WORLD_CONTENT_V2.nationIds.filter((id) => (
      isHumanSelectableNationV2(WORLD_CONTENT_V2, id)
    )).length);
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
      .filter((nation): nation is NonNullable<typeof nation> => (
        Boolean(nation) && nation!.kind !== 'rogue-ai'
      ))
      .sort((left, right) => compareIntroNationMetricsV2(left, right, 'power', opening))
      .map((nation) => nation.id);

    expect(sorted).toEqual(opening.ranking.map((entry) => entry.player.id));
  });

  it('offers one unambiguous pure military ranking choice', () => {
    expect(INTRO_SORT_OPTIONS.map((option) => option.value)).toEqual([
      'power', 'attack', 'defense', 'iq', 'manpower',
      'economy', 'gdp-per-capita', 'economic-growth', 'tax', 'population', 'growth',
    ]);
    expect(INTRO_SORT_OPTIONS.map((option) => option.value)).not.toContain('aggressiveness');
    expect(INTRO_SORT_OPTIONS[0]?.label).toBe('Military ranking');
  });

  it('starts a solo campaign without an interrupting fullscreen prompt', () => {
    expect(worldUiSource).not.toContain('We recommend playing Frontier Command in fullscreen');
    expect(worldUiSource).not.toContain('data-action="fullscreen-windowed"');
    expect(worldUiSource).not.toContain('data-action="fullscreen-enter"');
    expect(worldUiSource).not.toContain("document.documentElement.requestFullscreen?.()");
    expect(worldUiSource).not.toContain("document.addEventListener('fullscreenchange', this.onFullscreenChange)");
    expect(worldUiSource).not.toContain('country-preview__fullscreen');
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
    const neutralRelative = introRelativeStatSourcesV2(preview!);
    expect(neutralRelative.army).toBe(preview!.army.deployed);
    expect(neutralRelative).not.toHaveProperty('reserve');
    expect(neutralRelative.treasury).toBe(preview!.player.treasury);

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
    expect(neutralRelative.army).not.toBe(actualArmy.deployed);
  });
});
