import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  combatDefenseEffectV2,
  CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
  DEFENDER_POSITION_MULTIPLIER,
  WAR_MOBILIZATION_TICKS,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import {
  stateTerritoryArmyCapacityTargetV2,
  stateTerritoryArmySupportCeilingV2,
  territoryArmyCapacityTargetV2,
} from './capacity';
import { territoryTerrainDefenseMultiplierV2, WORLD_CONTENT_V2 } from './content';
import { assertInvariantsV2 } from './invariants';
import {
  createMilitaryBaseSnapshotV2,
  selectArmyCapacityTargetV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectNationalIqViewV2,
  selectNationalEconomyV2,
  selectMilitaryBaseRatingsV2,
  selectTerritoriesOfV2,
  selectTotalManpowerV2,
  invalidateTerritoryIndexV2,
} from './selectors';
import { enterPostBlackoutCampaignForTestV2 } from './testSupport';
import {
  declareWarV2,
  processWarsV2,
  redistributeArmiesV2,
  resolveBattlePulseV2,
  supplyFactorV2,
} from './war';
import { nationIdV2, territoryIdV2, type FrontOperationV2, type WarStateV2, type WorldStateV2 } from './types';

const bel = nationIdV2('bel');
const nld = nationIdV2('nld');
const deu = nationIdV2('deu');
const belTerritory = territoryIdV2('bel');
const nldTerritory = territoryIdV2('nld');
const deuTerritory = territoryIdV2('deu');
const usa = nationIdV2('usa');
const canTerritory = territoryIdV2('can');

function testWar(state: WorldStateV2, attacker = bel, defender = nld, id = 'war-capture'): WarStateV2 {
  const war: WarStateV2 = {
    id, attackerId: attacker, defenderId: defender, startedTick: 0, lastBattleTick: 0,
    warScore: 0, battles: 0, attackerLosses: 0, defenderLosses: 0,
    lastPeaceOfferTick: -1,
    attackerOperations: [], defenderOperations: [],
  };
  state.wars.push(war);
  return war;
}

function operation(sourceId = belTerritory, targetId = nldTerritory, commanderId = bel): FrontOperationV2 {
  const edge = WORLD_CONTENT_V2.territories[sourceId].connections.find((connection) => connection.targetId === targetId)!;
  return {
    commanderId, sourceId, targetId, doctrine: 'breakthrough', access: edge.kind === 'sea' ? 'naval' : 'land',
    startedTick: 0, lastBattleTick: 0, holdUntilTick: 12, momentum: 0,
  };
}

describe('V2 combat, capture and absorption', () => {
  it('does not grant enemy population or output before a territory is actually conquered', () => {
    const state = createWorldStateV2(100);
    const belgianOutput = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, testWar(state), operation())!;

    expect(event.conquered).toBe(false);
    expect(state.territories[nldTerritory].owner).toBe(nld);
    expect(selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput).toBeCloseTo(belgianOutput, 8);
  });

  it('unlocks absorbed-land capacity in direct proportion to integration', () => {
    const state = createWorldStateV2(19);
    const beforeTarget = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, usa);
    const canada = state.territories[canTerritory];
    canada.population *= 0.75;
    const currentCanadianPopulation = canada.population;
    canada.owner = usa;
    canada.integration = 0.10;
    canada.army = {
      ...canada.army,
      manpower: 0, capacity: 0,
    };
    invalidateTerritoryIndexV2(state);

    const immediateTarget = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, usa);
    const expectedCanadianContribution = territoryArmyCapacityTargetV2(
      WORLD_CONTENT_V2,
      canTerritory,
      usa,
      currentCanadianPopulation,
      state.players[usa].research.effectLevels['force-capacity'],
      0.10,
    );
    expect(immediateTarget - beforeTarget).toBeCloseTo(expectedCanadianContribution, 8);

    canada.integration = 1;
    const fullyIntegratedTarget = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, usa);
    expect(immediateTarget - beforeTarget).toBeCloseTo(
      (fullyIntegratedTarget - beforeTarget) * 0.10,
      5,
    );
  });

  it('uses no hidden defender layer and keeps terrain visible without an artificial pulse ceiling', () => {
    const state = createWorldStateV2(20);
    const target = state.territories[nldTerritory];
    const source = state.territories[belTerritory];
    source.army.baseAttack *= 100;
    const targetManpowerBefore = target.army.manpower;
    const sourceManpowerBefore = source.army.manpower;
    const supply = supplyFactorV2(state, WORLD_CONTENT_V2, nld, nldTerritory, false);
    const attackerAttack = selectEffectiveAttackV2(
      state, WORLD_CONTENT_V2, bel, source.army,
    );
    const displayedDefense = selectEffectiveDefenseV2(
      state, WORLD_CONTENT_V2, nld, target.army,
    );
    const expectedShield = target.army.manpower
      * combatDefenseEffectV2(displayedDefense, attackerAttack)
      * DEFENDER_POSITION_MULTIPLIER
      * territoryTerrainDefenseMultiplierV2(WORLD_CONTENT_V2, nldTerritory)
      * supply
      * selectNationalIqViewV2(WORLD_CONTENT_V2, nld).logisticsMultiplier;
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, testWar(state), operation())!;
    expect(DEFENDER_POSITION_MULTIPLIER).toBe(1);
    expect(event.defenderPower).toBeCloseTo(expectedShield, 5);
    expect(event.defenderLosses).toBeGreaterThan(targetManpowerBefore * 0.05);
    expect(event.defenderLosses).toBeLessThanOrEqual(targetManpowerBefore);
    expect(event.attackerLosses).toBeLessThanOrEqual(sourceManpowerBefore);
    expect(event.attackerSupply).toBeGreaterThanOrEqual(0.25);
    expect(event.attackerSupply).toBeLessThanOrEqual(1);
  });

  it('captures only after decisive collapse and transfers pre-collapsed land in one pulse', () => {
    const healthy = createWorldStateV2(21);
    expect(resolveBattlePulseV2(healthy, WORLD_CONTENT_V2, testWar(healthy), operation())!.conquered).toBe(false);

    const collapsed = createWorldStateV2(22);
    const reserveTerritory = territoryIdV2('lux');
    collapsed.territories[reserveTerritory].owner = nld;
    collapsed.territories[reserveTerritory].coreOwner = nld;
    collapsed.territories[reserveTerritory].integration = 1;
    invalidateTerritoryIndexV2(collapsed);
    collapsed.territories[nldTerritory].army.manpower = 0;
    expect(resolveBattlePulseV2(
      collapsed, WORLD_CONTENT_V2, testWar(collapsed), operation(),
    )!.conquered).toBe(true);
    expect(collapsed.territories[nldTerritory].owner).toBe(bel);

    const noSurvival = createWorldStateV2(23);
    noSurvival.territories[nldTerritory].army.manpower = 0;
    noSurvival.territories[belTerritory].army.manpower = 0;
    expect(resolveBattlePulseV2(noSurvival, WORLD_CONTENT_V2, testWar(noSurvival), operation())!.conquered).toBe(false);
  });

  it('does not let a late neighbouring attacker overwrite the established conquest claim', () => {
    const state = createWorldStateV2(2301);
    state.wars = [];
    const target = state.territories[nldTerritory];
    target.army.manpower = 0;
    const establishedWar = testWar(state, bel, nld, 'war-established-claim');
    establishedWar.defenderLosses = 0.25;
    establishedWar.battles = 12;
    const lateWar = testWar(state, deu, nld, 'war-late-entry');
    lateWar.defenderLosses = 0.001;
    lateWar.battles = 1;
    const lateOperation = operation(deuTerritory, nldTerritory, deu);

    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, lateWar, lateOperation)!;

    expect(event.conquered).toBe(false);
    expect(target.owner).toBe(nld);
  });

  it('awards the next unopposed territory to the real war contributor, not the last entrant', () => {
    const state = createWorldStateV2(2302);
    state.wars = [];
    state.territories[nldTerritory].army.manpower = 0;
    const establishedWar = testWar(state, bel, nld, 'war-established');
    establishedWar.defenderLosses = 0.25;
    establishedWar.battles = 12;
    const lateWar = testWar(state, deu, nld, 'war-a-late-entry');
    lateWar.defenderLosses = 0.001;
    lateWar.battles = 1;
    state.tick = WAR_MOBILIZATION_TICKS;

    processWarsV2(state, WORLD_CONTENT_V2);

    expect(state.territories[nldTerritory].owner).toBe(bel);
    expect(selectTerritoriesOfV2(state, nld)).toHaveLength(0);
    expect(state.wars.some((war) => war.attackerId === deu && war.defenderId === nld)).toBe(false);
  });

  it('keeps two opportunistic invasions bilateral instead of creating a rival coalition war', () => {
    const state = createWorldStateV2(23021);
    state.wars = [];
    testWar(state, bel, nld, 'war-primary-invasion');
    state.players[deu].treasury = 1_000_000;

    expect(declareWarV2(state, WORLD_CONTENT_V2, deu, nld).accepted).toBe(true);
    expect(state.wars.some((war) => war.attackerId === deu && war.defenderId === nld)).toBe(true);
    expect(state.wars.some((war) => (
      (war.attackerId === deu && war.defenderId === bel)
      || (war.attackerId === bel && war.defenderId === deu)
    ))).toBe(false);

    state.territories[nldTerritory].owner = bel;
    state.territories[nldTerritory].coreOwner = bel;
    state.territories[nldTerritory].integration = 1;
    delete state.territories[nldTerritory].integrationProgram;
    invalidateTerritoryIndexV2(state);
    processWarsV2(state, WORLD_CONTENT_V2);

    expect(state.wars.some((war) => war.attackerId === nld || war.defenderId === nld)).toBe(false);
    expect(state.wars.some((war) => (
      (war.attackerId === deu && war.defenderId === bel)
      || (war.attackerId === bel && war.defenderId === deu)
    ))).toBe(false);
  });

  it('ignores a linked-war hint and keeps the Campaign declaration bilateral', () => {
    const state = createWorldStateV2(23022);
    state.wars = [];
    const invasion = testWar(state, bel, nld, 'war-linked-invasion');
    state.players[deu].treasury = 1_000_000;
    enterPostBlackoutCampaignForTestV2(state);

    expect(declareWarV2(state, WORLD_CONTENT_V2, deu, bel, invasion.id).accepted).toBe(true);
    expect(state.wars.some((war) => war.attackerId === deu && war.defenderId === bel)).toBe(true);
    expect(state.wars.some((war) => (
      (war.attackerId === deu && war.defenderId === nld)
      || (war.attackerId === nld && war.defenderId === deu)
    ))).toBe(false);
  });

  it('keeps an AI campaign active after one conquest until an army is destroyed or peace is negotiated', () => {
    const state = createWorldStateV2(2303);
    const reserveTerritory = territoryIdV2('lux');
    state.territories[reserveTerritory].owner = nld;
    state.territories[reserveTerritory].coreOwner = nld;
    state.territories[reserveTerritory].integration = 1;
    invalidateTerritoryIndexV2(state);
    const target = state.territories[nldTerritory];
    target.army.manpower = 0;
    const war = testWar(state, deu, nld, 'war-limited-objective');
    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, operation(deuTerritory, nldTerritory, deu))!;
    expect(battle.conquered).toBe(true);
    expect(selectTerritoriesOfV2(state, nld)).toHaveLength(1);

    expect(state.wars.some((active) => active.id === war.id)).toBe(true);
    expect(state.truces.some((truce) => (
      (truce.leftId === deu && truce.rightId === nld) || (truce.leftId === nld && truce.rightId === deu)
    ))).toBe(false);
  });

  it('absorbs retained value, transfers a conquest guard, and applies final-elimination spoils only', () => {
    const state = createWorldStateV2(24);
    const source = state.territories[belTerritory];
    const target = state.territories[nldTerritory];
    target.army.manpower = 0;
    const beforeSourceManpower = source.army.manpower;
    const beforePopulation = target.population;
    const beforeEconomy = target.economy;
    const beforeTreasury = state.players[nld].treasury;
    const capacityTargetBefore = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    const controlledOutputBefore = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput;
    const war = testWar(state);
    const front = operation();
    war.attackerOperations = [front];
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, front)!;

    expect(event.conquered).toBe(true);
    expect(target.owner).toBe(bel);
    // Declaration pays the one-percent opening loss once at war creation;
    // direct conquest resolution must not charge that cost a second time.
    expect(event.attackerLosses).toBe(0);
    expect(event.capturedPopulation).toBeCloseTo(beforePopulation - event.populationLoss, 5);
    expect(event.capturedEconomy).toBeCloseTo(beforeEconomy - event.economyLoss, 5);
    expect(target.population).toBeCloseTo(event.capturedPopulation, 8);
    expect(target.economy).toBeCloseTo(event.capturedEconomy, 8);
    expect(target.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(state, WORLD_CONTENT_V2, nldTerritory, bel),
      8,
    );
    expect(source.army.manpower + target.army.manpower)
      .toBeCloseTo(beforeSourceManpower - event.attackerLosses, 6);
    expect(target.army.manpower).toBeCloseTo(Math.min(
      beforeSourceManpower * CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE,
      stateTerritoryArmySupportCeilingV2(state, WORLD_CONTENT_V2, nldTerritory, bel),
    ), 8);
    expect(source.army.manpower).toBeGreaterThanOrEqual(
      beforeSourceManpower * (1 - CONQUEST_CAPTURE_GUARD_MAX_TRANSFER_SHARE)
        - event.attackerLosses - 1e-7,
    );
    expect(target.integration).toBe(0.10);
    expect(target.integrationProgram?.startedTick).toBe(state.tick);
    const immediateCapacityTarget = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    const immediateControlledOutput = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput;
    target.integration = 1;
    const fullyIntegratedCapacityTarget = selectArmyCapacityTargetV2(state, WORLD_CONTENT_V2, bel);
    const fullyIntegratedControlledOutput = selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput;
    target.integration = 0.10;
    expect(immediateCapacityTarget).toBeGreaterThan(capacityTargetBefore);
    expect(fullyIntegratedCapacityTarget).toBeGreaterThan(immediateCapacityTarget);
    expect(immediateCapacityTarget - capacityTargetBefore).toBeCloseTo(
      (fullyIntegratedCapacityTarget - capacityTargetBefore) * 0.10,
      6,
    );
    expect(immediateControlledOutput).toBeGreaterThan(controlledOutputBefore);
    expect(fullyIntegratedControlledOutput).toBeGreaterThan(immediateControlledOutput);
    expect(immediateControlledOutput - controlledOutputBefore).toBeCloseTo(
      (fullyIntegratedControlledOutput - controlledOutputBefore) * 0.10,
      6,
    );
    expect(event.treasurySeized).toBeCloseTo(beforeTreasury * 0.25, 5);
    expect(state.players[nld].treasury).toBe(0);
    expect(selectTerritoriesOfV2(state, bel)).toHaveLength(2);
    expect(selectNationalEconomyV2(state, WORLD_CONTENT_V2, bel).controlledOutput).toBeGreaterThan(0);
    expect(war.attackerOperations).toHaveLength(0);
    const empireManpower = selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0);
    const empireCapacity = selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.capacity, 0);
    redistributeArmiesV2(state, WORLD_CONTENT_V2);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.manpower, 0)).toBeCloseTo(empireManpower, 8);
    expect(selectTerritoriesOfV2(state, bel).reduce((sum, territory) => sum + territory.army.capacity, 0)).toBeCloseTo(empireCapacity, 8);
    assertInvariantsV2(state, WORLD_CONTENT_V2);

    const engine = new WorldEngineV2(1, WORLD_CONTENT_V2, state);
    expect(engine.setResearchAllocations(nld, { ...state.players[nld].research.allocations }).accepted).toBe(false);
    expect(engine.adjustBudget(nld, 'military', 5).accepted).toBe(false);
  });

  it('preserves the conquest guard quality and applies conqueror research after absorption', () => {
    const state = createWorldStateV2(25);
    state.players[bel].research.effectLevels.attack = 20;
    state.players[nld].research.effectLevels.attack = 0;
    state.territories[nldTerritory].army.manpower = 0;
    resolveBattlePulseV2(state, WORLD_CONTENT_V2, testWar(state), operation());
    state.wars = [];
    expect(state.territories[nldTerritory].army.baseAttack).toBe(
      WORLD_CONTENT_V2.nations[bel].militaryAttackRating,
    );
    const capturedQualityMix = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2)
      .byNation.get(bel)!;
    expect(capturedQualityMix.attack).toBeCloseTo(
      WORLD_CONTENT_V2.nations[bel].militaryAttackRating, 8,
    );
    const nextEdge = WORLD_CONTENT_V2.territories[nldTerritory].connections.find((edge) => {
      const owner = state.territories[edge.targetId]?.owner;
      return owner && owner !== bel;
    })!;
    const third = state.territories[nextEdge.targetId].owner;
    const war = testWar(state, bel, third, 'war-next');
    const nextOperation: FrontOperationV2 = {
      commanderId: bel,
      sourceId: nldTerritory,
      targetId: nextEdge.targetId,
      doctrine: 'pressure',
      access: nextEdge.kind === 'sea' ? 'naval' : 'land',
      startedTick: 1,
      lastBattleTick: 1,
      holdUntilTick: 12,
      momentum: 0,
    };
    const militaryBaseSnapshot = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2);
    const qualityMix = selectMilitaryBaseRatingsV2(
      state, WORLD_CONTENT_V2, bel, militaryBaseSnapshot,
    );
    const expectedAttack = selectEffectiveAttackV2(
      state, WORLD_CONTENT_V2, bel, state.territories[nldTerritory].army, militaryBaseSnapshot,
    );
    const formerOwnerAttack = selectEffectiveAttackV2(state, WORLD_CONTENT_V2, nld, state.territories[nldTerritory].army);
    const event = resolveBattlePulseV2(state, WORLD_CONTENT_V2, war, nextOperation)!;
    expect(event.attackerId).toBe(bel);
    expect(event.sourceId).toBe(nldTerritory);
    expect(expectedAttack).not.toBe(formerOwnerAttack);
    expect(qualityMix).toEqual(capturedQualityMix);
    expect(state.territories[nldTerritory].owner).toBe(bel);
  });
});
