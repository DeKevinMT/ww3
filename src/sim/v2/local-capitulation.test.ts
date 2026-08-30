import { describe, expect, it } from 'vitest';
import {
  LOCAL_FORMATION_CAPITULATION_MAX_FILL_V2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  initializeCommanderForceV2,
  selectCommanderBattleSupportV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import {
  nationIdV2,
  territoryIdV2,
  type CommanderForceInitializationV2,
  type FrontOperationV2,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import { resolveBattlePulseV2 } from './war';

const attackerId = nationIdV2('nld');
const defenderId = nationIdV2('bel');
const sourceId = territoryIdV2('nld');
const targetId = territoryIdV2('bel');
const localCapacity = 1;

const apexProfile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.02,
    maxIntegrity: 0.04,
    rechargeBuffer: 0.01,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.32,
  defenseMultiplier: 1.36,
  treasury: 0,
  annualOutput: 6,
  supplyStock: 2,
};

function operation(state: WorldStateV2, momentum = 0): FrontOperationV2 {
  return {
    commanderId: attackerId,
    sourceId,
    targetId,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: state.tick,
    holdUntilTick: state.tick + 8,
    momentum,
  };
}

function war(
  state: WorldStateV2,
  front: FrontOperationV2,
  defenderLosses = 0,
): WarStateV2 {
  const activeWar: WarStateV2 = {
    id: `war-local-capitulation-${state.rngState}`,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses,
    attackerCivilianLosses: 0,
    defenderCivilianLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [front],
    defenderOperations: [],
    revenge: null,
  };
  state.wars = [activeWar];
  return activeWar;
}

function battleFixture(
  seed: number,
  defenderManpower: number,
  options: {
    attackerManpower?: number;
    attackerBaseAttack?: number;
    momentum?: number;
    priorDefenderLosses?: number;
  } = {},
) {
  const state = createWorldStateV2(seed, WORLD_CONTENT_V2);
  state.tick = 30;
  const source = state.territories[sourceId]!;
  const target = state.territories[targetId]!;
  source.army.capacity = localCapacity;
  source.army.manpower = options.attackerManpower ?? 0.001;
  if (options.attackerBaseAttack !== undefined) {
    source.army.baseAttack = options.attackerBaseAttack;
  }
  target.army.capacity = localCapacity;
  target.army.manpower = defenderManpower;
  // Remove counterfire so the surviving national attacker, not APEX, remains
  // the factual formation that can accept a capitulation.
  target.army.baseAttack = 0;
  const front = operation(state, options.momentum);
  const activeWar = war(state, front, options.priorDefenderLosses);
  return { state, source, target, front, activeWar };
}

describe('local formation capitulation', () => {
  it.each([
    ['just above one percent', 0.0101, false],
    ['at one percent', 0.0100, true],
    ['below one percent', 0.0099, true],
  ] as const)('%s is decided from post-allocation national manpower', (
    _label,
    openingDefenderManpower,
    expectedConquest,
  ) => {
    const fixture = battleFixture(71_001, openingDefenderManpower, {
      // Isolate the boundary itself: this is still a resolved battle pulse,
      // but no casualty rounding can move a formation across the threshold.
      attackerBaseAttack: 0,
    });

    const event = resolveBattlePulseV2(
      fixture.state,
      WORLD_CONTENT_V2,
      fixture.activeWar,
      fixture.front,
    )!;
    const postAllocationManpower = openingDefenderManpower
      - event.regularDefenderLosses;
    const threshold = localCapacity
      * LOCAL_FORMATION_CAPITULATION_MAX_FILL_V2;

    expect(event.regularDefenderLosses).toBe(0);
    expect(postAllocationManpower).toBe(openingDefenderManpower);
    expect(postAllocationManpower > threshold).toBe(!expectedConquest);
    expect(event.conquered).toBe(expectedConquest);
    expect(fixture.target.owner).toBe(expectedConquest ? attackerId : defenderId);
  });

  it('preserves the existing zero-manpower capture path', () => {
    const fixture = battleFixture(71_002, 0);

    const event = resolveBattlePulseV2(
      fixture.state,
      WORLD_CONTENT_V2,
      fixture.activeWar,
      fixture.front,
    )!;

    expect(event.conquered).toBe(true);
    expect(fixture.target.owner).toBe(attackerId);
  });

  it('does not let remaining APEX Integrity keep a one-percent army alive', () => {
    const fixture = battleFixture(71_003, 0.01);
    fixture.state.humanPlayerId = defenderId;
    fixture.state.humanPlayerIds = [defenderId];
    fixture.state.tick = 0;
    expect(initializeCommanderForceV2(
      fixture.state,
      WORLD_CONTENT_V2,
      defenderId,
      apexProfile,
    ).accepted).toBe(true);
    fixture.state.tick = 30;
    fixture.source.army.capacity = localCapacity;
    fixture.source.army.manpower = 0.02;
    fixture.target.army.capacity = localCapacity;
    fixture.target.army.manpower = 0.01;
    fixture.target.army.baseAttack = 0;
    expect(selectCommanderBattleSupportV2(
      fixture.state,
      fixture.activeWar,
      fixture.front,
      WORLD_CONTENT_V2,
    ).defender?.playerId).toBe(defenderId);
    const force = fixture.state.commanderForces[defenderId]!;

    const event = resolveBattlePulseV2(
      fixture.state,
      WORLD_CONTENT_V2,
      fixture.activeWar,
      fixture.front,
    )!;

    expect(event.commanderDefenderLosses).toBeGreaterThan(0);
    expect(force.shield.integrity).toBeGreaterThan(0);
    expect(event.conquered).toBe(true);
    expect(fixture.target.owner).toBe(attackerId);
  });

  it('keeps the broader decisive-surrender path above one percent', () => {
    const fixture = battleFixture(71_004, 0.05, {
      attackerManpower: 0.50,
      attackerBaseAttack: 0.01,
      momentum: 0.60,
      priorDefenderLosses: 0.80,
    });

    const event = resolveBattlePulseV2(
      fixture.state,
      WORLD_CONTENT_V2,
      fixture.activeWar,
      fixture.front,
    )!;
    const postAllocationManpower = 0.05 - event.regularDefenderLosses;

    expect(postAllocationManpower).toBeGreaterThan(
      localCapacity * LOCAL_FORMATION_CAPITULATION_MAX_FILL_V2,
    );
    expect(event.conquered).toBe(true);
    expect(fixture.target.owner).toBe(attackerId);
  });
});
