import { describe, expect, it } from 'vitest';
import { WORLD_CONTENT_V2 } from './content';
import {
  processPropagandaProgramsV2,
  PROPAGANDA_RETIRED_REASON_V2,
} from './propaganda';
import { WorldEngineV2 } from './WorldEngineV2';

describe('retired propaganda compatibility', () => {
  it('returns one immutable migration-safe rejection', () => {
    const engine = new WorldEngineV2(4_001);
    const playerId = engine.state.humanPlayerId;
    engine.state.players[playerId]!.treasury = 1_000_000;
    const beforeHash = engine.canonicalHash();

    expect(engine.propagandaTerms(playerId)).toMatchObject({
      allowed: false,
      reason: PROPAGANDA_RETIRED_REASON_V2,
    });
    expect(engine.launchPropaganda(playerId)).toEqual({
      accepted: false,
      reason: PROPAGANDA_RETIRED_REASON_V2,
    });
    expect(engine.canonicalHash()).toBe(beforeHash);
  });

  it('normalizes legacy active programs without cash or political effects', () => {
    const engine = new WorldEngineV2(4_002);
    const playerId = engine.state.humanPlayerId;
    const nation = engine.state.players[playerId]!;
    nation.propagandaProgram = {
      startedTick: 0,
      endsTick: 52,
      totalSuspicionReduction: 15,
      weeklySuspicionReduction: 15 / 52,
    };
    engine.state.aiEscalation.globalThreat = 60;
    const cashBefore = nation.treasury;

    processPropagandaProgramsV2(engine.state);

    expect(nation.propagandaProgram).toBeNull();
    expect(nation.treasury).toBe(cashBefore);
    expect(engine.state.aiEscalation.globalThreat).toBe(60);
  });

  it('round-trips an old valid envelope and retires it deterministically', () => {
    const engine = new WorldEngineV2(4_003);
    const playerId = engine.state.humanPlayerId;
    engine.state.players[playerId]!.propagandaProgram = {
      startedTick: 0,
      endsTick: 52,
      totalSuspicionReduction: 15,
      weeklySuspicionReduction: 15 / 52,
    };
    engine.state.players[playerId]!.propagandaAvailableTick = 104;
    const restored = WorldEngineV2.fromSave(engine.save());

    processPropagandaProgramsV2(engine.state);
    processPropagandaProgramsV2(restored.state);

    expect(restored.state.players[playerId]!.propagandaProgram).toBeNull();
    expect(restored.canonicalHash()).toBe(engine.canonicalHash());
  });

  it('keeps rival legacy commands non-authoritative', () => {
    const engine = new WorldEngineV2(4_004);
    const rivalId = WORLD_CONTENT_V2.nationIds.find((id) => id !== engine.state.humanPlayerId)!;
    expect(engine.propagandaTerms(rivalId)).toMatchObject({
      allowed: false,
      reason: 'Propaganda is a manual player program.',
    });
  });
});
