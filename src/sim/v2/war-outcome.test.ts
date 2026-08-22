import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { WorldEngineV2 } from './WorldEngineV2';
import type { PlayerId, WarOutcomeV2 } from './types';

const id = (value: string) => value as PlayerId;

describe('transient post-war outcomes', () => {
  it('emits one exact human report for an accepted reparations peace', () => {
    const state = createWorldStateV2(9_101, WORLD_CONTENT_V2);
    const humanId = id('bel');
    const opponentId = id('lux');
    state.humanPlayerId = humanId;
    state.tick = 80;
    state.aiEscalation.lastWarStartTick = 1_000_000;
    state.wars = [{
      id: 'war-outcome-reparations',
      attackerId: humanId,
      defenderId: opponentId,
      startedTick: 20,
      lastBattleTick: 78,
      warScore: 4,
      battles: 10,
      attackerLosses: 0.012,
      defenderLosses: 0.021,
      attackerCivilianLosses: 0.004,
      defenderCivilianLosses: 0.009,
      lastPeaceOfferTick: 79,
      attackerOperations: [],
      defenderOperations: [],
    }];
    state.players[opponentId].treasury = 20;
    state.offers = [{
      id: 'offer-outcome-reparations',
      fromId: opponentId,
      toId: humanId,
      warId: 'war-outcome-reparations',
      settlement: 'reparations',
      createdTick: 79,
      expiresTick: 100,
      status: 'pending',
      cashAmount: 4,
    }];
    const treasuryBefore = state.players[humanId].treasury;
    const engine = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    const outcomes: WarOutcomeV2[] = [];
    engine.subscribe((_next, change) => {
      if (change.warOutcome) outcomes.push(change.warOutcome);
    });

    expect(engine.respondToOffer('offer-outcome-reparations', true).accepted).toBe(true);
    engine.step();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      warId: 'war-outcome-reparations',
      humanId,
      opponentId,
      humanRole: 'attacker',
      battles: 10,
      ownLosses: 0.012,
      enemyLosses: 0.021,
      ownCivilianLosses: 0.004,
      enemyCivilianLosses: 0.009,
      reparationsReceived: 4,
      reparationsPaid: 0,
      treasuryBefore,
      treasuryAfter: treasuryBefore + 4,
    });
    expect(outcomes[0]!.combatExperienceBefore).toBe(0);
    expect(outcomes[0]!.combatExperienceAfter).toBeGreaterThan(0);
    expect(outcomes[0]!.combatExperienceGained).toBeCloseTo(
      outcomes[0]!.combatExperienceAfter - outcomes[0]!.combatExperienceBefore,
      7,
    );
    expect(outcomes[0]!.baseAttackAfter).toBeCloseTo(outcomes[0]!.baseAttackBefore, 8);
    expect(outcomes[0]!.baseDefenseAfter).toBeCloseTo(outcomes[0]!.baseDefenseBefore, 8);
    expect(engine.state.wars).toHaveLength(0);
  });
});
