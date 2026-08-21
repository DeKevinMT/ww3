import { describe, expect, it } from 'vitest';
import {
  PROPAGANDA_COOLDOWN_TICKS,
  PROPAGANDA_COST_REVENUE_WEEKS,
  PROPAGANDA_DURATION_TICKS,
  PROPAGANDA_MIN_COST_BILLIONS,
  PROPAGANDA_TOTAL_SUSPICION_REDUCTION,
  MANUAL_ACTION_BASE_DISCOUNT,
} from './balance';
import { WORLD_CONTENT_V2 } from './content';
import { invariantErrorsV2 } from './invariants';
import { processPropagandaProgramsV2 } from './propaganda';
import { nationIdV2 } from './types';
import { WorldEngineV2 } from './WorldEngineV2';

describe('canonical propaganda program', () => {
  it('quotes a very high structural-tax cost with logarithmic empire scaling and a tiny-state floor', () => {
    const engine = new WorldEngineV2(4_001);
    const playerId = engine.state.humanPlayerId;
    engine.state.players[playerId]!.treasury = 1_000_000;
    const beforeHash = engine.canonicalHash();
    const terms = engine.propagandaTerms(playerId);

    expect(terms.allowed).toBe(true);
    expect(terms.durationTicks).toBe(PROPAGANDA_DURATION_TICKS);
    expect(terms.cooldownTicks).toBe(PROPAGANDA_COOLDOWN_TICKS);
    expect(terms.totalSuspicionReduction).toBe(PROPAGANDA_TOTAL_SUSPICION_REDUCTION);
    expect(terms.empireScale).toBeGreaterThan(1);
    expect(terms.cost).toBeCloseTo(terms.baseCost, 6);
    expect(terms.cost).toBeLessThan(terms.structuralWeeklyTaxRevenue * PROPAGANDA_COST_REVENUE_WEEKS);
    expect(engine.canonicalHash()).toBe(beforeHash);
    engine.state.players[playerId]!.manualActionUses.propaganda = 1;
    expect(engine.propagandaTerms(playerId).cost).toBeGreaterThan(terms.cost);

    const smallest = WORLD_CONTENT_V2.nationIds
      .map((id) => engine.propagandaTerms(id))
      .sort((left, right) => left.cost - right.cost)[0]!;
    expect(smallest.cost).toBeGreaterThanOrEqual(PROPAGANDA_MIN_COST_BILLIONS * MANUAL_ACTION_BASE_DISCOUNT);
  });

  it('charges once at the tick boundary and reduces suspicion gradually, never instantly', () => {
    const control = new WorldEngineV2(4_002);
    const engine = new WorldEngineV2(4_002);
    const playerId = engine.state.humanPlayerId;
    control.state.players[playerId]!.treasury = 1_000_000;
    engine.state.players[playerId]!.treasury = 1_000_000;
    control.state.aiEscalation.globalThreat = 60;
    engine.state.aiEscalation.globalThreat = 60;
    const terms = engine.propagandaTerms(playerId);
    const cashBefore = engine.state.players[playerId]!.treasury;

    expect(engine.launchPropaganda(playerId)).toEqual({ accepted: true });
    expect(engine.state.aiEscalation.globalThreat).toBe(60);
    expect(engine.state.players[playerId]!.treasury).toBe(cashBefore);
    expect(engine.state.players[playerId]!.propagandaProgram).toBeNull();

    control.step();
    engine.step();
    expect(control.state.players[playerId]!.treasury - engine.state.players[playerId]!.treasury)
      .toBeCloseTo(terms.cost, 5);
    expect(control.state.aiEscalation.globalThreat - engine.state.aiEscalation.globalThreat)
      .toBeCloseTo(terms.weeklySuspicionReduction, 5);
    expect(engine.state.aiEscalation.globalThreat).toBeGreaterThan(60 - terms.totalSuspicionReduction);
    expect(engine.state.players[playerId]!.propagandaProgram).not.toBeNull();
  });

  it('runs for exactly 52 ticks, then retains its start-to-start 104-week cooldown', () => {
    const engine = new WorldEngineV2(4_003);
    const playerId = engine.state.humanPlayerId;
    engine.state.players[playerId]!.treasury = 1_000_000;
    engine.state.aiEscalation.globalThreat = 80;
    expect(engine.launchPropaganda(playerId).accepted).toBe(true);

    engine.step();
    for (let tick = 2; tick < PROPAGANDA_DURATION_TICKS; tick += 1) {
      engine.state.tick = tick;
      processPropagandaProgramsV2(engine.state);
    }
    expect(engine.state.tick).toBe(51);
    expect(engine.state.players[playerId]!.propagandaProgram).not.toBeNull();
    expect(engine.propagandaTerms(playerId)).toMatchObject({
      activeRemainingTicks: 1,
      activeProgress: 0.980769,
    });

    engine.state.tick = PROPAGANDA_DURATION_TICKS;
    processPropagandaProgramsV2(engine.state);
    expect(engine.state.tick).toBe(52);
    expect(engine.state.players[playerId]!.propagandaProgram).toBeNull();
    expect(engine.propagandaTerms(playerId)).toMatchObject({
      allowed: false,
      cooldownRemainingTicks: PROPAGANDA_COOLDOWN_TICKS - PROPAGANDA_DURATION_TICKS,
    });

    engine.state.tick = PROPAGANDA_COOLDOWN_TICKS;
    expect(engine.state.tick).toBe(PROPAGANDA_COOLDOWN_TICKS);
    expect(engine.propagandaTerms(playerId).allowed).toBe(true);
  });

  it('requires sufficient positive player cash and never lowers suspicion below zero', () => {
    const engine = new WorldEngineV2(4_004);
    const playerId = engine.state.humanPlayerId;
    const rivalId = WORLD_CONTENT_V2.nationIds.find((id) => id !== playerId)!;
    engine.state.players[playerId]!.treasury = 0;
    expect(engine.propagandaTerms(playerId)).toMatchObject({ allowed: false });
    expect(engine.propagandaTerms(rivalId)).toMatchObject({
      allowed: false,
      reason: 'Propaganda is a manual player program.',
    });

    engine.state.aiEscalation.globalThreat = 0.01;
    engine.state.tick = 1;
    engine.state.players[playerId]!.propagandaProgram = {
      startedTick: 0,
      endsTick: PROPAGANDA_DURATION_TICKS,
      totalSuspicionReduction: PROPAGANDA_TOTAL_SUSPICION_REDUCTION,
      weeklySuspicionReduction: PROPAGANDA_TOTAL_SUSPICION_REDUCTION / PROPAGANDA_DURATION_TICKS,
    };
    engine.state.players[playerId]!.propagandaAvailableTick = PROPAGANDA_COOLDOWN_TICKS;
    processPropagandaProgramsV2(engine.state);
    expect(engine.state.aiEscalation.globalThreat).toBe(0);
  });

  it('round-trips an active program through canonical save/hash deterministically', () => {
    const engine = new WorldEngineV2(4_005);
    const playerId = nationIdV2(engine.state.humanPlayerId);
    engine.state.players[playerId]!.treasury = 1_000_000;
    engine.state.aiEscalation.globalThreat = 75;
    expect(engine.launchPropaganda(playerId).accepted).toBe(true);
    engine.step(2);

    const serialized = engine.save();
    const restored = WorldEngineV2.fromSave(serialized);
    expect(restored.state.players[playerId]!.propagandaProgram)
      .toEqual(engine.state.players[playerId]!.propagandaProgram);
    expect(restored.canonicalHash()).toBe(engine.canonicalHash());

    engine.step(2);
    restored.step(2);
    expect(restored.canonicalHash()).toBe(engine.canonicalHash());
    expect(restored.state.aiEscalation.globalThreat).toBe(engine.state.aiEscalation.globalThreat);
  });

  it('rejects stranded rival programs and locks country switching after campaign start', () => {
    const engine = new WorldEngineV2(4_006);
    const humanId = engine.state.humanPlayerId;
    const rivalId = WORLD_CONTENT_V2.nationIds.find((id) => id !== humanId)!;
    engine.state.players[rivalId]!.propagandaProgram = {
      startedTick: 0,
      endsTick: PROPAGANDA_DURATION_TICKS,
      totalSuspicionReduction: PROPAGANDA_TOTAL_SUSPICION_REDUCTION,
      weeklySuspicionReduction: PROPAGANDA_TOTAL_SUSPICION_REDUCTION / PROPAGANDA_DURATION_TICKS,
    };
    engine.state.players[rivalId]!.propagandaAvailableTick = PROPAGANDA_COOLDOWN_TICKS;
    expect(invariantErrorsV2(engine.state, WORLD_CONTENT_V2))
      .toContain(`Nation ${rivalId} has an invalid propaganda program.`);

    engine.state.players[rivalId]!.propagandaProgram = null;
    engine.state.tick = 1;
    expect(engine.chooseCountry(rivalId)).toMatchObject({ accepted: false });
    expect(engine.state.humanPlayerId).toBe(humanId);
  });
});
