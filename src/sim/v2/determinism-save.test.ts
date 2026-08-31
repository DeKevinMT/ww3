import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  nationalArmyCapacityTargetV2,
  stateTerritoryArmyDeploymentLimitV2,
  stateTerritoryArmySupportCeilingV2,
} from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import { loadSaveV2 } from './persistence';
import { projectFinanceManpowerPhaseV2, selectWeeklyFinanceBreakdownV2 } from './selectors';
import { nationIdV2 } from './types';

describe('V2 deterministic ticks, queues and saves', () => {
  it('produces the same canonical hash after every identical seeded tick', () => {
    const left = new WorldEngineV2(101);
    const right = new WorldEngineV2(101);
    for (let tick = 0; tick < 8; tick += 1) {
      left.step();
      right.step();
      expect(left.canonicalHash()).toBe(right.canonicalHash());
    }
  }, 30_000);

  it('applies an exact Development allocation only on a tick boundary', () => {
    const engine = new WorldEngineV2(102);
    const bel = nationIdV2('bel');
    const before = { ...engine.state.players[bel].research.allocations };
    const next = {
      'population-recruitment': 0, 'military-industry': 0, 'advanced-weapons': 60,
      'defensive-systems': 20, 'logistics-medicine': 10, 'economy-science': 10,
      'food-systems': 0, 'reserve-doctrine': 0, 'public-administration': 0,
      'education-intelligence': 0,
    } as const;
    expect(engine.setResearchAllocations(bel, next).accepted).toBe(true);
    expect(engine.state.players[bel].research.allocations).toEqual(before);
    expect(() => engine.save()).toThrow(/tick boundary/);
    engine.step();
    expect(engine.state.players[bel].research.allocations).toEqual(next);
  }, 15_000);

  it('queues and applies an exact budget mix atomically', () => {
    const engine = new WorldEngineV2(105);
    const bel = nationIdV2('bel');
    const before = { ...engine.state.players[bel].budget };
    const desired = { military: 55, research: 20, development: 25 } as const;
    expect(engine.setBudgetPolicy(bel, desired)).toEqual({ accepted: true });
    expect(engine.state.players[bel].budget).toEqual(before);
    expect(engine.setBudgetPolicy(bel, { military: 55, research: 20, development: 20 }).accepted).toBe(false);
    engine.step();
    expect(engine.state.players[bel].budget).toEqual(desired);
    expect(Object.values(engine.state.players[bel].budget).reduce((sum, value) => sum + value, 0)).toBe(100);
  }, 15_000);

  it('previews a proposed budget without mutating canonical state', () => {
    const engine = new WorldEngineV2(106);
    const bel = nationIdV2('bel');
    const beforeBudget = { ...engine.state.players[bel].budget };
    const beforeHash = engine.canonicalHash();
    const preview = engine.weeklyFinanceBreakdownForBudget(bel, {
      military: 70,
      research: 15,
      development: 15,
    });
    expect(Object.values(preview.activeBudget).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Number.isFinite(preview.military + preview.research + preview.development)).toBe(true);
    expect(engine.state.players[bel].budget).toEqual(beforeBudget);
    expect(engine.canonicalHash()).toBe(beforeHash);
    expect(() => engine.weeklyFinanceBreakdownForBudget(bel, {
      military: 70,
      research: 15,
      development: 10,
    })).toThrow(/summing to 100/i);
  });

  it('round-trips a save and continues with byte-identical hashes', () => {
    const uninterrupted = new WorldEngineV2(103);
    uninterrupted.step(4);
    const resumed = WorldEngineV2.fromSave(uninterrupted.save());
    expect(resumed.canonicalHash()).toBe(uninterrupted.canonicalHash());
    for (let tick = 0; tick < 4; tick += 1) {
      uninterrupted.step();
      resumed.step();
      expect(resumed.canonicalHash()).toBe(uninterrupted.canonicalHash());
    }
  }, 30_000);

  it('rejects hash tampering and unknown versions explicitly', () => {
    const engine = new WorldEngineV2(104);
    const parsed = JSON.parse(engine.save()) as Record<string, unknown>;
    const tampered = structuredClone(parsed);
    (tampered.players as Record<string, { treasury: number }>).bel.treasury += 1;
    expect(() => loadSaveV2(tampered as never, WORLD_CONTENT_V2)).toThrow(/hash mismatch/);
    const unknown = structuredClone(parsed);
    unknown.rulesVersion = 'future-rules';
    expect(() => loadSaveV2(unknown as never, WORLD_CONTENT_V2)).toThrow(/rulesVersion/);
    const legacyFocusSchema = structuredClone(parsed);
    legacyFocusSchema.schemaVersion = 3;
    expect(() => loadSaveV2(legacyFocusSchema as never, WORLD_CONTENT_V2)).toThrow(/schemaVersion.*schema 13/i);
  });

  it('preserves a negative treasury as sovereign debt in saves', () => {
    const engine = new WorldEngineV2(908);
    engine.state.players[engine.state.humanPlayerId].treasury = -12.34;
    const resumed = WorldEngineV2.fromSave(engine.save());
    expect(resumed.state.players[resumed.state.humanPlayerId].treasury).toBe(-12.34);
    expect(resumed.canonicalHash()).toBe(engine.canonicalHash());
  });

  it('keeps a multi-seed 40-day soak invariant-safe with the live opening threat model', () => {
    for (const seed of [201, 202]) {
      const engine = new WorldEngineV2(seed);
      expect(engine.chooseCountry(nationIdV2('usa'))).toEqual({ accepted: true });
      engine.step(40);
      assertInvariantsV2(engine.state, WORLD_CONTENT_V2);
      expect(engine.state.tick).toBe(40);
      for (const nationId of WORLD_CONTENT_V2.nationIds) {
        const finance = selectWeeklyFinanceBreakdownV2(
          engine.state, WORLD_CONTENT_V2, nationId,
        );
        const projection = projectFinanceManpowerPhaseV2(
          engine.state, WORLD_CONTENT_V2, nationId, finance,
        );
        const nationalCapacity = nationalArmyCapacityTargetV2(
          engine.state, WORLD_CONTENT_V2, nationId,
        );
        const nationalFreeRoom = Math.max(
          0,
          nationalCapacity - projection.deployedAfterDemobilization,
        );
        expect(projection.recruited).toBeLessThanOrEqual(nationalFreeRoom + 1e-9);
        expect(projection.deployedAfterFinance).toBeLessThanOrEqual(
          Math.max(projection.deployedAfterDemobilization, nationalCapacity) + 1e-9,
        );
        for (const projected of projection.territories) {
          const current = engine.state.territories[projected.id]!.army.manpower;
          const supportCeiling = stateTerritoryArmySupportCeilingV2(
            engine.state, WORLD_CONTENT_V2, projected.id, nationId,
          );
          const stableLimit = stateTerritoryArmyDeploymentLimitV2(
            engine.state, WORLD_CONTENT_V2, projected.id, nationId,
          );
          expect(projected.manpower).toBeLessThanOrEqual(stableLimit + 1e-9);
          if (current > supportCeiling && finance.acceleratedDemobilization === 0) {
            expect(projected.manpower).toBe(current);
          }
        }
      }
    }
  }, 60_000);
});
