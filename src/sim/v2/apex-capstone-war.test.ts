import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { initializeCommanderForceV2 } from './commanderForce';
import { ROGUE_AI_NATION_ID_V2, WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderCapabilitiesV2,
  type CommanderFrontAssignmentV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  resolveBattlePulseV2,
  resolveCommanderStandaloneDamageV2,
} from './war';

const apexProfile = (capabilities: Partial<CommanderCapabilitiesV2>) => ({
  shield: {
    integrity: 0.1,
    maxIntegrity: 0.1,
    rechargeBuffer: 0,
    rechargeMultiplier: 1,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.10,
  defenseMultiplier: 1.12,
  treasury: 0,
  annualOutput: 0,
  supplyStock: 10,
  capabilities,
});

function operation(
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
): FrontOperationV2 {
  return {
    commanderId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 0,
    momentum: 0,
  };
}

function war(
  id: string,
  attackerId: PlayerId,
  defenderId: PlayerId,
  front: FrontOperationV2,
): WarStateV2 {
  return {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [front],
    defenderOperations: [],
    revenge: null,
  };
}

function belgiumWorld(
  seed: number,
  capabilities: Partial<CommanderCapabilitiesV2>,
): { state: WorldStateV2; humanId: PlayerId } {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  const humanId = nationIdV2('bel');
  state.humanPlayerId = humanId;
  state.humanPlayerIds = [humanId];
  expect(initializeCommanderForceV2(
    state,
    WORLD_CONTENT_V2,
    humanId,
    apexProfile(capabilities),
  ).accepted).toBe(true);
  state.tick = 100;
  return { state, humanId };
}

function assignApexFront(
  state: WorldStateV2,
  humanId: PlayerId,
  battleWar: WarStateV2,
  mission: 'assault-support' | 'defense',
): void {
  const front = battleWar.attackerOperations[0]!;
  const force = state.commanderForces[humanId]!;
  force.locationId = mission === 'assault-support' ? front.sourceId : front.targetId;
  force.mission = mission;
  force.front = {
    warId: battleWar.id,
    sourceId: front.sourceId,
    targetId: front.targetId,
  };
}

describe('EONSCAR capstones at the live war boundary', () => {
  it('keeps the standalone-damage compatibility helper available for Rogue PRIME', () => {
    const humanId = nationIdV2('bel');
    expect(resolveCommanderStandaloneDamageV2(humanId, {
      pulseAttack: 10,
      nationalParticipatingManpower: 10,
      hostileCurrentManpower: 2,
    })).toBe(0);
    expect(resolveCommanderStandaloneDamageV2(ROGUE_AI_NATION_ID_V2, {
      pulseAttack: 10,
      nationalParticipatingManpower: 0.05,
      hostileCurrentManpower: 2,
    })).toBe(10);
    expect(resolveCommanderStandaloneDamageV2(ROGUE_AI_NATION_ID_V2, {
      pulseAttack: 10,
      nationalParticipatingManpower: 10,
      hostileCurrentManpower: 0.001,
    })).toBe(10);
    expect(resolveCommanderStandaloneDamageV2(ROGUE_AI_NATION_ID_V2, {
      pulseAttack: 10,
      nationalParticipatingManpower: 0,
      hostileCurrentManpower: 2,
    })).toBe(0);
    expect(resolveCommanderStandaloneDamageV2(ROGUE_AI_NATION_ID_V2, {
      pulseAttack: 10,
      nationalParticipatingManpower: 2,
      hostileCurrentManpower: 0,
    })).toBe(0);
  });

  it('cycles attack-side shield efficiency without firing or paying for standalone damage', () => {
    const { state, humanId } = belgiumWorld(96_101, {
      assaultSpecialist: true,
    });
    const defenderId = nationIdV2('nld');
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('nld');
    state.territories[sourceId]!.army.manpower = 1;
    state.territories[sourceId]!.army.capacity = 1;
    state.territories[targetId]!.army.manpower = 2;
    state.territories[targetId]!.army.capacity = 2;
    const front = operation(humanId, sourceId, targetId);
    const battleWar = war('apex-lancer-live', humanId, defenderId, front);
    state.wars = [battleWar];
    assignApexFront(state, humanId, battleWar, 'assault-support');
    const integrityBefore = state.commanderForces[humanId]!.shield.integrity;

    const first = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, battleWar, front,
    )!;
    const second = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, battleWar, front,
    )!;
    const third = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, battleWar, front,
    )!;

    expect(first.commanderAttackerSingularityPulse).toBe(false);
    expect(second.commanderAttackerSingularityPulse).toBe(false);
    expect(third.commanderAttackerSingularityPulse).toBe(false);
    expect(first.commanderAttackerPulseDamage).toBe(0);
    expect(second.commanderAttackerPulseDamage).toBe(0);
    expect(third.commanderAttackerPulseDamage).toBe(0);
    expect(first.commanderAttackerCounterpulseDamage).toBe(0);
    // This is the supported national Army's extra pressure, not an independent
    // APEX attack, and therefore remains part of the ordinary combat exchange.
    expect(first.commanderAttackerPower).toBeGreaterThan(0);
    expect(battleWar.apexTelemetryByPlayer?.[humanId])
      .toMatchObject({
        singularityPulses: 1,
        mirrorCounterpulseDamage: 0,
      });
    expect(state.commanderForces[humanId]!.doctrineRuntime)
      .toMatchObject({ lancerSupportedAssaultCount: 0 });
    // Shield Energy changes only by damage it actually intercepted; the old
    // third-hit Pulse debit is gone.
    expect(integrityBefore - state.commanderForces[humanId]!.shield.integrity)
      .toBeCloseTo(
        first.commanderAttackerLosses
          + second.commanderAttackerLosses
          + third.commanderAttackerLosses,
        9,
      );
  });

  it('intercepts as a defending shield without Pulse or reflected personnel damage', () => {
    const { state, humanId } = belgiumWorld(96_102, {
      defenseSpecialist: true,
    });
    const attackerId = nationIdV2('nld');
    const sourceId = territoryIdV2('nld');
    const targetId = territoryIdV2('bel');
    state.territories[sourceId]!.army.manpower = 1;
    state.territories[sourceId]!.army.capacity = 1;
    state.territories[targetId]!.army.manpower = 1;
    state.territories[targetId]!.army.capacity = 1;
    const front = operation(attackerId, sourceId, targetId);
    const battleWar = war('apex-mirror-live', attackerId, humanId, front);
    state.wars = [battleWar];
    assignApexFront(state, humanId, battleWar, 'defense');
    const hostileBefore = state.territories[sourceId]!.army.manpower;

    const event = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, battleWar, front,
    )!;

    expect(event.commanderDefenderInterceptedDamage).toBeGreaterThan(0);
    expect(event.commanderDefenderCounterpulseDamage).toBe(0);
    expect(event.commanderDefenderPulseDamage).toBe(0);
    expect(hostileBefore - state.territories[sourceId]!.army.manpower)
      .toBeCloseTo(event.regularAttackerLosses, 9);
    expect(event.attackerLosses).toBeCloseTo(event.regularAttackerLosses, 9);
    expect(event.defenderLosses).toBeCloseTo(event.regularDefenderLosses, 9);
    expect(event.commanderDefenderLosses).toBeGreaterThan(0);
    expect(event.defenderLosses).not.toBeCloseTo(
      event.regularDefenderLosses + event.commanderDefenderLosses,
      9,
    );
    expect(battleWar.attackerLosses).toBeCloseTo(event.attackerLosses, 9);
    expect(battleWar.defenderLosses).toBeCloseTo(event.defenderLosses, 9);
  });

  it('intercepts on the attacking side without returning damage', () => {
    const { state, humanId } = belgiumWorld(96_104, {
      defenseSpecialist: true,
    });
    const defenderId = nationIdV2('nld');
    const sourceId = territoryIdV2('bel');
    const targetId = territoryIdV2('nld');
    state.territories[sourceId]!.army.manpower = 1;
    state.territories[sourceId]!.army.capacity = 1;
    state.territories[targetId]!.army.manpower = 1;
    state.territories[targetId]!.army.capacity = 1;
    const front = operation(humanId, sourceId, targetId);
    const battleWar = war('apex-mirror-attacker-live', humanId, defenderId, front);
    state.wars = [battleWar];
    assignApexFront(state, humanId, battleWar, 'assault-support');
    const hostileBefore = state.territories[targetId]!.army.manpower;

    const event = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, battleWar, front,
    )!;

    expect(event.commanderAttackerInterceptedDamage).toBeGreaterThan(0);
    expect(event.commanderAttackerCounterpulseDamage).toBe(0);
    expect(event.commanderAttackerPulseDamage).toBe(0);
    expect(event.commanderDefenderCounterpulseDamage).toBe(0);
    expect(hostileBefore - state.territories[targetId]!.army.manpower)
      .toBeCloseTo(event.regularDefenderLosses, 9);
    expect(event.defenderLosses).toBeCloseTo(event.regularDefenderLosses, 9);
    expect(event.attackerLosses).toBeCloseTo(event.regularAttackerLosses, 9);
    expect(battleWar.apexTelemetryByPlayer?.[humanId]).toMatchObject({
      supportedBattles: 1,
      mirrorCounterpulseDamage: event.commanderAttackerCounterpulseDamage,
    });
  });

  it('resolves two Theater Mesh fronts at 60% against one shared Integrity pool', () => {
    const { state, humanId } = belgiumWorld(96_103, {
      forceMultiplier: true,
    });
    const primarySourceId = territoryIdV2('bel');
    const primaryTargetId = territoryIdV2('nld');
    const secondarySourceId = territoryIdV2('lux');
    state.territories[secondarySourceId]!.owner = humanId;
    state.territories[secondarySourceId]!.coreOwner = humanId;
    state.territories[secondarySourceId]!.integration = 1;
    state.territories[secondarySourceId]!.integrationProgram = null;
    invalidateTerritoryIndexV2(state);
    const secondaryTargetId = WORLD_CONTENT_V2.territories[secondarySourceId]!
      .connections
      .map((connection) => connection.targetId)
      .find((territoryId) => state.territories[territoryId]?.owner !== humanId
        && state.territories[territoryId]?.owner !== state.territories[primaryTargetId]!.owner)!;
    expect(secondaryTargetId).toBeDefined();
    for (const territoryId of [
      primarySourceId,
      primaryTargetId,
      secondarySourceId,
      secondaryTargetId,
    ]) {
      state.territories[territoryId]!.army.manpower = 1;
      state.territories[territoryId]!.army.capacity = 1;
    }
    const primaryFront = operation(humanId, primarySourceId, primaryTargetId);
    const secondaryFront = operation(humanId, secondarySourceId, secondaryTargetId);
    const primaryWar = war(
      'apex-twin-primary',
      humanId,
      state.territories[primaryTargetId]!.owner,
      primaryFront,
    );
    const secondaryWar = war(
      'apex-twin-secondary',
      humanId,
      state.territories[secondaryTargetId]!.owner,
      secondaryFront,
    );
    state.wars = [primaryWar, secondaryWar];
    assignApexFront(state, humanId, primaryWar, 'assault-support');
    const force = state.commanderForces[humanId]!;
    const primaryAssignment: CommanderFrontAssignmentV2 = {
      warId: primaryWar.id,
      sourceId: primarySourceId,
      targetId: primaryTargetId,
    };
    force.doctrineRuntime = {
      lancerSupportedAssaultCount: 0,
      emergencyRebootUsed: false,
      secondaryProjection: {
        locationId: secondarySourceId,
        mission: 'assault-support',
        front: {
          warId: secondaryWar.id,
          sourceId: secondarySourceId,
          targetId: secondaryTargetId,
        },
        pairedPrimaryFront: primaryAssignment,
      },
    };
    const integrityBefore = force.shield.integrity;
    const energyBefore = force.economy.supplyStock;

    const primary = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, primaryWar, primaryFront,
    )!;
    const integrityAfterPrimary = force.shield.integrity;
    const energyAfterPrimary = force.economy.supplyStock;
    const secondary = resolveBattlePulseV2(
      state, WORLD_CONTENT_V2, secondaryWar, secondaryFront,
    )!;

    expect(primary.commanderAttackerProjection).toBe('primary');
    expect(secondary.commanderAttackerProjection).toBe('secondary');
    expect(primary.commanderAttackerProjectionShare).toBe(0.6);
    expect(secondary.commanderAttackerProjectionShare).toBe(0.6);
    expect(integrityAfterPrimary).toBeLessThan(integrityBefore);
    expect(force.shield.integrity).toBeLessThan(integrityAfterPrimary);
    // Human APEX no longer spends a second, location-bound supply pool. Both
    // fronts draw damage from the same integrity record above.
    expect(energyAfterPrimary).toBe(energyBefore);
    expect(force.economy.supplyStock).toBe(energyAfterPrimary);
    expect(force.doctrineRuntime.secondaryProjection).not.toHaveProperty('army');
    expect(force.doctrineRuntime.secondaryProjection).not.toHaveProperty('economy');
  });
});
