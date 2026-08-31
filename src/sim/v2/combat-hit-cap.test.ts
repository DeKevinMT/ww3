import { describe, expect, it } from 'vitest';
import {
  COMBAT_HIT_EMPIRE_CAP_SHARE_V2,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2,
  APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2,
  allocateApexFrontlineDamageV2,
} from './commanderForce';
import { WORLD_CONTENT_V2 } from './content';
import { invalidateTerritoryIndexV2, selectTotalManpowerV2 } from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  forecastWarV2,
  projectCombatExchangeV2,
  resolveApexPulseDamageV2,
  resolveBattlePulseV2,
  resolveFrontlineHitV2,
} from './war';

const belgium = nationIdV2('bel');
const netherlands = nationIdV2('nld');
const belgiumTerritory = territoryIdV2('bel');
const netherlandsTerritory = territoryIdV2('nld');

function setArmy(
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpower: number,
  capacity: number,
): void {
  state.territories[territoryId]!.army = {
    ...state.territories[territoryId]!.army,
    manpower,
    capacity,
  };
}

function transferIntegratedTerritory(
  state: WorldStateV2,
  territoryId: TerritoryId,
  ownerId: typeof belgium | typeof netherlands,
  manpower: number,
  capacity: number,
): void {
  const territory = state.territories[territoryId]!;
  territory.owner = ownerId;
  territory.coreOwner = ownerId;
  territory.integration = 1;
  delete territory.integrationProgram;
  setArmy(state, territoryId, manpower, capacity);
  invalidateTerritoryIndexV2(state);
}

function operation(): FrontOperationV2 {
  return {
    commanderId: belgium,
    sourceId: belgiumTerritory,
    targetId: netherlandsTerritory,
    doctrine: 'pressure',
    access: 'land',
    startedTick: 0,
    lastBattleTick: 0,
    holdUntilTick: 12,
    momentum: 0,
  };
}

function war(activeOperation: FrontOperationV2): WarStateV2 {
  return {
    id: 'war-frontline-hit-cap',
    attackerId: belgium,
    defenderId: netherlands,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: [activeOperation],
    defenderOperations: [],
  };
}

describe('one symmetric frontline hit ceiling', () => {
  it('caps a hit by ten percent of Empire capacity and by the local frontier army', () => {
    expect(COMBAT_HIT_EMPIRE_CAP_SHARE_V2).toBe(0.10);
    expect(resolveFrontlineHitV2({
      requestedBaseDamage: 0.40,
      frontlineManpower: 0.30,
      empireArmyCapacity: 1,
    })).toEqual({
      hitCap: 0.10,
      baseDamage: 0.10,
      apexDamage: 0,
      totalDamage: 0.10,
    });
    expect(resolveFrontlineHitV2({
      requestedBaseDamage: 0.05,
      frontlineManpower: 0.30,
      empireArmyCapacity: 1,
    }).totalDamage).toBe(0.05);
    expect(resolveFrontlineHitV2({
      requestedBaseDamage: 0.40,
      frontlineManpower: 0.03,
      empireArmyCapacity: 1,
    }).totalDamage).toBe(0.03);
  });

  it('applies the final receiving-side DEF factor before the ten-percent cap', () => {
    const hit = resolveFrontlineHitV2({
      requestedBaseDamage: 0.12,
      receivingDamageMultiplier: 0.50,
      frontlineManpower: 1,
      empireArmyCapacity: 1,
    });

    // Post-DEF damage is 0.06 and therefore never touches the 0.10 ceiling.
    // Capping first and applying DEF afterwards would incorrectly produce 0.05.
    expect(hit.hitCap).toBe(0.10);
    expect(hit.baseDamage).toBe(0.06);
    expect(hit.totalDamage).toBe(0.06);
  });

  it('uses the complete multi-territory Empire capacity without exposing rear troops', () => {
    const state = createWorldStateV2(97_001, WORLD_CONTENT_V2);
    setArmy(state, netherlandsTerritory, 0.25, 0.25);
    transferIntegratedTerritory(
      state,
      territoryIdV2('usa'),
      netherlands,
      0,
      0.75,
    );
    const empireCapacity = selectTotalManpowerV2(state, netherlands).capacity;
    expect(empireCapacity).toBeCloseTo(1, 9);

    const hit = resolveFrontlineHitV2({
      requestedBaseDamage: 1,
      frontlineManpower: state.territories[netherlandsTerritory]!.army.manpower,
      empireArmyCapacity: empireCapacity,
    });
    expect(hit.hitCap).toBeCloseTo(0.10, 9);
    expect(hit.totalDamage).toBeCloseTo(0.10, 9);
    expect(state.territories[territoryIdV2('usa')]!.army.manpower).toBe(0);
  });

  it('derives raw combat only from the two frontier formations', () => {
    const local = createWorldStateV2(97_002, WORLD_CONTENT_V2);
    local.wars = [];
    setArmy(local, belgiumTerritory, 0.10, 0.10);
    setArmy(local, netherlandsTerritory, 0.10, 0.10);
    const belgianRearId = territoryIdV2('usa');
    const dutchRearId = territoryIdV2('chn');
    transferIntegratedTerritory(local, belgianRearId, belgium, 0, 0);
    transferIntegratedTerritory(local, dutchRearId, netherlands, 0, 0);
    const localProjection = projectCombatExchangeV2(
      local,
      WORLD_CONTENT_V2,
      belgium,
      netherlands,
      belgiumTerritory,
      netherlandsTerritory,
      'land',
      1,
      1,
    )!;

    const withRearArmies = structuredClone(local);
    setArmy(withRearArmies, belgianRearId, 5, 5);
    setArmy(withRearArmies, dutchRearId, 5, 5);
    withRearArmies.territories[belgianRearId]!.army.baseAttack
      = withRearArmies.territories[belgiumTerritory]!.army.baseAttack;
    withRearArmies.territories[belgianRearId]!.army.baseDefense
      = withRearArmies.territories[belgiumTerritory]!.army.baseDefense;
    withRearArmies.territories[dutchRearId]!.army.baseAttack
      = withRearArmies.territories[netherlandsTerritory]!.army.baseAttack;
    withRearArmies.territories[dutchRearId]!.army.baseDefense
      = withRearArmies.territories[netherlandsTerritory]!.army.baseDefense;
    const rearProjection = projectCombatExchangeV2(
      withRearArmies,
      WORLD_CONTENT_V2,
      belgium,
      netherlands,
      belgiumTerritory,
      netherlandsTerritory,
      'land',
      1,
      1,
    )!;

    expect(rearProjection.rawAttackerLosses)
      .toBeCloseTo(localProjection.rawAttackerLosses, 9);
    expect(rearProjection.rawDefenderLosses)
      .toBeCloseTo(localProjection.rawDefenderLosses, 9);
    expect(rearProjection.attackPressure).toBeCloseTo(localProjection.attackPressure, 9);
    expect(rearProjection.counterPressure).toBeCloseTo(localProjection.counterPressure, 9);
    expect(rearProjection.attackerHitCap).toBeGreaterThan(localProjection.attackerHitCap);
    expect(rearProjection.defenderHitCap).toBeGreaterThan(localProjection.defenderHitCap);
  });

  it('gives base combat first claim and lets Pulse use only the remaining hit budget', () => {
    expect(resolveFrontlineHitV2({
      requestedBaseDamage: 0.08,
      requestedApexDamage: 0.07,
      frontlineManpower: 0.50,
      empireArmyCapacity: 1,
    })).toEqual({
      hitCap: 0.10,
      baseDamage: 0.08,
      apexDamage: 0.02,
      totalDamage: 0.10,
    });
    expect(resolveFrontlineHitV2({
      requestedBaseDamage: 0.12,
      requestedApexDamage: 0.07,
      frontlineManpower: 0.50,
      empireArmyCapacity: 1,
    })).toEqual({
      hitCap: 0.10,
      baseDamage: 0.10,
      apexDamage: 0,
      totalDamage: 0.10,
    });
  });

  it('requires real national armies on both sides before EONSCAR Pulse can fire', () => {
    expect(resolveApexPulseDamageV2({
      pulseAttack: 10,
      nationalParticipatingManpower: 0,
      hostileCurrentManpower: 2,
    })).toBe(0);
    expect(resolveApexPulseDamageV2({
      pulseAttack: 10,
      nationalParticipatingManpower: 0.001,
      hostileCurrentManpower: 0,
    })).toBe(0);
    expect(resolveApexPulseDamageV2({
      pulseAttack: 10,
      nationalParticipatingManpower: 0.001,
      hostileCurrentManpower: 2,
    })).toBe(10);
  });

  it('intercepts at most 75% of a hit while spending at most twenty percent of Max Energy', () => {
    expect(APEX_FRONTLINE_SHIELD_INTERCEPT_SHARE_V2).toBe(0.75);
    expect(APEX_SHIELD_MAX_ENERGY_LOSS_SHARE_PER_HIT_V2).toBe(0.20);
    const healthy = allocateApexFrontlineDamageV2({
      requestedDamage: 0.50,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 0.80,
        maxIntegrity: 1,
      },
    });
    expect(healthy.interceptedDamage).toBeCloseTo(0.20, 9);
    expect(healthy.apexLosses).toBeCloseTo(0.20, 9);
    expect(healthy.nationalLosses).toBeCloseTo(0.30, 9);

    const depleted = allocateApexFrontlineDamageV2({
      requestedDamage: 0.50,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 0.04,
        maxIntegrity: 1,
      },
    });
    expect(depleted.interceptedDamage).toBeCloseTo(0.04, 9);
    expect(depleted.nationalLosses).toBeCloseTo(0.46, 9);

    const smallHit = allocateApexFrontlineDamageV2({
      requestedDamage: 0.03,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 0.80,
        maxIntegrity: 1,
      },
    });
    expect(smallHit.interceptedDamage).toBeCloseTo(0.0225, 9);
    expect(smallHit.apexLosses).toBeCloseTo(0.0225, 9);
    expect(smallHit.nationalLosses).toBeCloseTo(0.0075, 9);
  });

  it('applies the 75% shield share after DEF and the existing Empire hit cap', () => {
    const postDefenseHit = resolveFrontlineHitV2({
      requestedBaseDamage: 1,
      receivingDamageMultiplier: 0.75,
      frontlineManpower: 1,
      empireArmyCapacity: 1,
    });
    expect(postDefenseHit.totalDamage).toBeCloseTo(0.10, 9);

    const allocation = allocateApexFrontlineDamageV2({
      requestedDamage: postDefenseHit.totalDamage,
      nationalManpower: 1,
      apex: {
        shieldActive: true,
        integrity: 1,
        maxIntegrity: 1,
        interceptEfficiency: 1.45,
      },
    });
    expect(allocation.interceptedDamage).toBeCloseTo(0.075, 9);
    expect(allocation.nationalLosses).toBeCloseTo(0.025, 9);
    expect(allocation.apexLosses).toBeCloseTo(0.075 / 1.45, 9);
  });

  it('keeps cap-binding forecast, projection and first live pulse aligned', () => {
    const state = createWorldStateV2(97_003, WORLD_CONTENT_V2);
    state.tick = WAR_MOBILIZATION_TICKS;
    state.wars = [];
    setArmy(state, belgiumTerritory, 0.40, 0.40);
    setArmy(state, netherlandsTerritory, 0.40, 0.40);
    for (const territoryId of [belgiumTerritory, netherlandsTerritory]) {
      state.territories[territoryId]!.army.baseAttack = 1_000_000;
      state.territories[territoryId]!.army.baseDefense = 0.000001;
    }
    const projected = projectCombatExchangeV2(
      state,
      WORLD_CONTENT_V2,
      belgium,
      netherlands,
      belgiumTerritory,
      netherlandsTerritory,
      'land',
      1,
      1,
    )!;
    expect(projected.rawAttackerLosses).toBeGreaterThan(projected.attackerHitCap);
    expect(projected.rawDefenderLosses).toBeGreaterThan(projected.defenderHitCap);
    expect(projected.attackerLosses).toBeCloseTo(0.04, 9);
    expect(projected.defenderLosses).toBeCloseTo(0.04, 9);

    const forecast = forecastWarV2(state, WORLD_CONTENT_V2, belgium, netherlands);
    expect(forecast.projectedAttackerLosses).toBeCloseTo(0.04, 9);
    expect(forecast.projectedDefenderLosses).toBeCloseTo(0.04, 9);

    const activeOperation = operation();
    const activeWar = war(activeOperation);
    state.wars = [activeWar];
    const event = resolveBattlePulseV2(
      state,
      WORLD_CONTENT_V2,
      activeWar,
      activeOperation,
    )!;
    expect(event.attackerLosses).toBeCloseTo(0.04, 9);
    expect(event.defenderLosses).toBeCloseTo(0.04, 9);
  });
});
