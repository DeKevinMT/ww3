import { describe, expect, it } from 'vitest';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import {
  applyApexShieldDamageV2,
  initializeCommanderForceV2,
  processCommanderForcesV2,
  selectApexShieldAttackV2,
  selectApexShieldCombatPowerV2,
  selectApexShieldDefenseV2,
  selectApexShieldIntegrityCurrentV2,
  selectApexShieldIntegrityMaxV2,
  selectApexShieldIntegrityPercentV2,
  selectApexShieldOperationalStateV2,
  selectApexShieldPresentationV2,
} from './commanderForce';
import { selectHumanEmpireDefeatWinnerV2 } from './humanPlayers';
import { createSaveV2, loadSaveV2 } from './persistence';
import {
  nationIdV2,
  type CommanderForceInitializationV2,
  type PlayerId,
  type WarStateV2,
  type WorldStateV2,
} from './types';

const profile: CommanderForceInitializationV2 = {
  shield: {
    integrity: 0.0005,
    maxIntegrity: 0.001,
    rechargeBuffer: 0,
    rechargeMultiplier: 1,
    pulseAttack: 0.001,
  },
  attackMultiplier: 1.08,
  defenseMultiplier: 1.08,
  treasury: 0,
  annualOutput: 0,
  supplyStock: 1,
};

function installApex(
  state: WorldStateV2,
  overrides: Partial<CommanderForceInitializationV2> = {},
): PlayerId {
  const playerId = state.humanPlayerId;
  expect(initializeCommanderForceV2(state, WORLD_CONTENT_V2, playerId, {
    ...profile,
    ...overrides,
  }).accepted).toBe(true);
  return playerId;
}

function totalNationalManpower(state: WorldStateV2): number {
  return Object.values(state.territories).reduce(
    (sum, territory) => sum + territory.army.manpower,
    0,
  );
}

function activeWar(state: WorldStateV2, playerId: PlayerId): WarStateV2 {
  const opponentId = WORLD_CONTENT_V2.nationIds.find((id) => id !== playerId)!;
  return {
    id: 'war-apex-shield-recovery-lock',
    attackerId: playerId,
    defenderId: opponentId,
    startedTick: state.tick,
    lastBattleTick: state.tick,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [],
    defenderOperations: [],
  };
}

describe('EONSCAR neural energy-shield platform', () => {
  it('projects legacy army storage as integrity, ATK/DEF and shield power', () => {
    const state = createWorldStateV2(94_001, WORLD_CONTENT_V2);
    const nationalManpowerBefore = totalNationalManpower(state);
    const playerId = installApex(state);

    expect(selectApexShieldPresentationV2(state, playerId)).toEqual({
      integrityCurrent: 0.0005,
      integrityMax: 0.001,
      integrityPercent: 50,
      operationalState: 'operational',
      attackMultiplier: 1.08,
      defenseMultiplier: 1.08,
      supportBonusPercent: 8,
      pulseAttack: 0,
    });
    expect(selectApexShieldIntegrityCurrentV2(state, playerId)).toBe(0.0005);
    expect(selectApexShieldIntegrityMaxV2(state, playerId)).toBe(0.001);
    expect(selectApexShieldIntegrityPercentV2(state, playerId)).toBe(50);
    expect(selectApexShieldOperationalStateV2(state, playerId)).toBe('operational');
    expect(selectApexShieldAttackV2(state, playerId)).toBe(1.08);
    expect(selectApexShieldDefenseV2(state, playerId)).toBe(1.08);
    expect(selectApexShieldCombatPowerV2(state, playerId)).toBe(8);

    // APEX may retire an old human opening overlay, but it never adds troop
    // manpower to any national territory when its separate dome is installed.
    expect(totalNationalManpower(state)).toBeLessThanOrEqual(nationalManpowerBefore);
    expect(Object.keys(state.commanderForces[playerId]!.shield).sort()).toEqual([
      'attackMultiplier',
      'defenseMultiplier',
      'defensivePulseMultiplier',
      'impactRecoveryShare',
      'integrity',
      'interceptEfficiency',
      'maxIntegrity',
      'pulseAttack',
      'pulseChargeBonusPerStep',
      'pulseProjectionRetention',
      'rechargeBuffer',
      'rechargeMultiplier',
    ]);
  });

  it('takes damage one-to-one and never recharges its Energy during war', () => {
    const state = createWorldStateV2(94_002, WORLD_CONTENT_V2);
    const playerId = installApex(state, {
      shield: { ...profile.shield, integrity: 0.001 },
      capabilities: { fieldHospital: true },
    });
    const force = state.commanderForces[playerId]!;
    state.wars.push(activeWar(state, playerId));

    expect(applyApexShieldDamageV2(state, playerId, 0.00025))
      .toBeCloseTo(0.00025, 9);
    expect(force.shield.integrity).toBe(0.00075);
    expect(force.shield.rechargeBuffer).toBe(0);
    expect(selectApexShieldIntegrityPercentV2(state, playerId)).toBe(75);

    const integrityAfterHit = force.shield.integrity;
    const recoveryBufferAfterHit = force.shield.rechargeBuffer;
    for (let week = 0; week < 12; week += 1) {
      state.tick += 1;
      processCommanderForcesV2(state, WORLD_CONTENT_V2);
    }

    expect(force.shield.integrity).toBe(integrityAfterHit);
    expect(force.shield.rechargeBuffer).toBe(recoveryBufferAfterHit);
    expect(selectApexShieldOperationalStateV2(state, playerId)).toBe('operational');
  });

  it('uses Emergency Reboot once per campaign and restores exactly 20% Energy', () => {
    const state = createWorldStateV2(94_006, WORLD_CONTENT_V2);
    const playerId = installApex(state, {
      shield: { ...profile.shield, integrity: 0.001 },
      capabilities: { fieldHospital: true },
    });
    const force = state.commanderForces[playerId]!;

    expect(applyApexShieldDamageV2(state, playerId, 1)).toBe(0.001);
    expect(force.shield.integrity).toBe(0.0002);
    expect(force.doctrineRuntime?.emergencyRebootUsed).toBe(true);
    expect(selectApexShieldOperationalStateV2(state, playerId)).toBe('operational');

    expect(applyApexShieldDamageV2(state, playerId, 1)).toBe(0.0002);
    expect(force.shield.integrity).toBe(0);
    expect(selectApexShieldOperationalStateV2(state, playerId)).toBe('recharging');
  });

  it('keeps true-zero extraction offline through save/load until exactly full', () => {
    const state = createWorldStateV2(94_003, WORLD_CONTENT_V2);
    const playerId = installApex(state, {
      shield: { ...profile.shield, integrity: 0.001 },
    });
    const recoveryNode = state.players[playerId]!.capitalId;

    expect(applyApexShieldDamageV2(state, playerId, 1)).toBe(0.001);
    expect(selectApexShieldPresentationV2(state, playerId)).toMatchObject({
      integrityCurrent: 0,
      integrityPercent: 0,
      operationalState: 'recharging',
      attackMultiplier: 1,
      defenseMultiplier: 1,
      supportBonusPercent: 0,
      pulseAttack: 0,
    });
    expect(state.commanderForces[playerId]).toMatchObject({
      locationId: recoveryNode,
      mission: 'hq-training',
      front: null,
      transit: null,
    });
    expect(state.events.at(-1)?.message).toContain('DOME OFFLINE');
    expect(state.events.at(-1)?.message).toContain('Energy reached zero');

    const zeroLoaded = loadSaveV2(
      createSaveV2(state, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(selectApexShieldPresentationV2(zeroLoaded, playerId)).toMatchObject({
      integrityPercent: 0,
      operationalState: 'recharging',
      supportBonusPercent: 0,
      pulseAttack: 0,
    });

    const loadedForce = zeroLoaded.commanderForces[playerId]!;
    loadedForce.shield.integrity = loadedForce.shield.maxIntegrity * 0.99999;
    loadedForce.shield.rechargeBuffer = loadedForce.shield.maxIntegrity * 0.01;
    const almostFullLoaded = loadSaveV2(
      createSaveV2(zeroLoaded, WORLD_CONTENT_V2),
      WORLD_CONTENT_V2,
    );
    expect(selectApexShieldPresentationV2(almostFullLoaded, playerId)).toMatchObject({
      integrityPercent: 99.9,
      operationalState: 'recharging',
      attackMultiplier: 1,
      defenseMultiplier: 1,
      supportBonusPercent: 0,
    });

    almostFullLoaded.tick += 1;
    processCommanderForcesV2(almostFullLoaded, WORLD_CONTENT_V2);
    expect(almostFullLoaded.commanderForces[playerId]!.shield.integrity)
      .toBe(almostFullLoaded.commanderForces[playerId]!.shield.maxIntegrity);
    expect(selectApexShieldPresentationV2(almostFullLoaded, playerId)).toEqual({
      integrityCurrent: 0.001,
      integrityMax: 0.001,
      integrityPercent: 100,
      operationalState: 'operational',
      attackMultiplier: 1.08,
      defenseMultiplier: 1.08,
      supportBonusPercent: 8,
      pulseAttack: 0,
    });
  });

  it('never substitutes dome integrity for national troops in defeat rules', () => {
    const state = createWorldStateV2(94_004, WORLD_CONTENT_V2);
    const playerId = installApex(state, {
      shield: { ...profile.shield, integrity: 0.001 },
    });
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === playerId) territory.army.manpower = 0;
    }
    state.players[playerId]!.trainedReserves = 0;

    expect(selectApexShieldCombatPowerV2(state, playerId)).toBe(8);
    expect(selectHumanEmpireDefeatWinnerV2(state)).toBeDefined();
    expect(selectHumanEmpireDefeatWinnerV2(state)).not.toBe(playerId);
  });

  it('uses an unavailable zero-value view when no compatible EONSCAR record exists', () => {
    const state = createWorldStateV2(94_005, WORLD_CONTENT_V2);
    const playerId = nationIdV2('bel');

    expect(selectApexShieldPresentationV2(state, playerId)).toBeNull();
    expect(selectApexShieldIntegrityPercentV2(state, playerId)).toBe(0);
    expect(selectApexShieldOperationalStateV2(state, playerId)).toBe('unavailable');
    expect(selectApexShieldAttackV2(state, playerId)).toBe(1);
    expect(selectApexShieldDefenseV2(state, playerId)).toBe(1);
    expect(selectApexShieldCombatPowerV2(state, playerId)).toBe(0);
  });
});
