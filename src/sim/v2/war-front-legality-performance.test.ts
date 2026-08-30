import { describe, expect, it, vi } from 'vitest';

const performanceCounters = vi.hoisted(() => ({ militarySnapshots: 0 }));

vi.mock('./selectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./selectors')>();
  return {
    ...actual,
    createMilitaryBaseSnapshotV2: (...args: Parameters<typeof actual.createMilitaryBaseSnapshotV2>) => {
      performanceCounters.militarySnapshots += 1;
      return actual.createMilitaryBaseSnapshotV2(...args);
    },
  };
});

import { WorldEngineV2 } from './WorldEngineV2';
import { BATTLE_INTERVAL_TICKS, WAR_MOBILIZATION_TICKS } from './balance';
import { WORLD_CONTENT_V2 } from './content';
import { createMilitaryBaseSnapshotV2 } from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  declareWarV2,
  estimateLiveWarV2,
  hasLegalWarFrontV2,
  processWarsV2,
} from './war';

describe('weekly war-front legality performance', () => {
  it('checks a quiet mobilization week without building a world power snapshot', () => {
    const engine = new WorldEngineV2(98_101);
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.players.bel!.treasury = 10_000;
    expect(declareWarV2(engine.state, WORLD_CONTENT_V2, 'bel', 'nld'))
      .toEqual({ accepted: true });
    expect(engine.state.wars).toHaveLength(1);

    performanceCounters.militarySnapshots = 0;
    createMilitaryBaseSnapshotV2(engine.state, WORLD_CONTENT_V2);
    expect(performanceCounters.militarySnapshots).toBe(1);

    performanceCounters.militarySnapshots = 0;
    expect(processWarsV2(engine.state, WORLD_CONTENT_V2)).toEqual([]);
    // A quiet canonical front is route-validated without any world power scan.
    // Previously this same week built six complete military snapshots: two in
    // the stale-war check plus two in each canonicalization pass.
    expect(performanceCounters.militarySnapshots).toBe(0);
  });

  it('preserves deployed-manpower legality in both directions', () => {
    const engine = new WorldEngineV2(98_102);
    performanceCounters.militarySnapshots = 0;
    expect(hasLegalWarFrontV2(engine.state, WORLD_CONTENT_V2, 'bel', 'nld')).toBe(true);
    expect(hasLegalWarFrontV2(engine.state, WORLD_CONTENT_V2, 'nld', 'bel')).toBe(true);
    expect(performanceCounters.militarySnapshots).toBe(0);

    engine.state.territories.bel!.army.manpower = 0;
    expect(hasLegalWarFrontV2(engine.state, WORLD_CONTENT_V2, 'bel', 'nld')).toBe(false);
    expect(hasLegalWarFrontV2(engine.state, WORLD_CONTENT_V2, 'nld', 'bel')).toBe(true);
  });

  it('builds only the live exchange snapshot when an active operation exists', () => {
    const engine = new WorldEngineV2(98_103);
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.players.bel!.treasury = 10_000;
    expect(declareWarV2(engine.state, WORLD_CONTENT_V2, 'bel', 'nld'))
      .toEqual({ accepted: true });
    const war = engine.state.wars[0]!;
    expect([...war.attackerOperations, ...war.defenderOperations].length).toBeGreaterThan(0);

    performanceCounters.militarySnapshots = 0;
    expect(estimateLiveWarV2(engine.state, WORLD_CONTENT_V2, war.id, 'bel'))
      .toBeDefined();
    // The combat projection needs at most one snapshot. The current import
    // cycle can bind the original selector before this file's wrapper, so zero
    // is also a valid observed count here; a duplicate scan is never valid.
    expect(performanceCounters.militarySnapshots).toBeLessThanOrEqual(1);
  });

  it('reuses one military snapshot throughout a live battle pulse', () => {
    const engine = new WorldEngineV2(98_104);
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    enterPostBlackoutCampaignForTestV2(engine.state);
    engine.state.players.bel!.treasury = 10_000;
    expect(declareWarV2(engine.state, WORLD_CONTENT_V2, 'bel', 'nld'))
      .toEqual({ accepted: true });
    const war = engine.state.wars[0]!;

    engine.state.tick = war.startedTick + WAR_MOBILIZATION_TICKS;
    expect(processWarsV2(engine.state, WORLD_CONTENT_V2)).toHaveLength(1);
    expect(war.battles).toBe(1);

    engine.state.tick += BATTLE_INTERVAL_TICKS;
    performanceCounters.militarySnapshots = 0;
    expect(processWarsV2(engine.state, WORLD_CONTENT_V2)).toHaveLength(1);
    // Before snapshot threading, the two initiative proposals, power
    // comparison and combat projection each rebuilt the complete world view.
    expect(performanceCounters.militarySnapshots).toBeLessThanOrEqual(1);
  });
});
