import { describe, expect, it } from 'vitest';
import { nextRandom } from '../../game/random';
import {
  ATTACKER_MILITARY_LOSS_MULTIPLIER,
  COMBAT_DAMAGE_EFFECTIVENESS,
  COMBAT_POWER_RATIO_EXPONENT,
  POST_WAR_TRANSITION_FATIGUE,
  WAR_ACCESS_CASUALTY_MULTIPLIER,
  WAR_ACCESS_SUPPLY_MULTIPLIER,
  warAccessSupplyMultiplierV2,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { WORLD_CONTENT_V2 } from './content';
import { quoteTerritoryIntegrationV2 } from './integration';
import {
  createMilitaryBaseSnapshotV2,
  invalidateTerritoryIndexV2,
  selectEffectiveAttackV2,
  selectEffectiveDefenseV2,
  selectTerritoryRouteDistanceKmV2,
  selectTotalManpowerV2,
} from './selectors';
import {
  nationIdV2,
  territoryIdV2,
  type FrontOperationV2,
  type PlayerId,
  type TerritoryId,
  type WarStateV2,
  type WorldStateV2,
} from './types';
import {
  forecastWarV2,
  projectCombatExchangeV2,
  resolveBattlePulseV2,
  respondToOfferV2,
  supplyFactorV2,
} from './war';

const operationV2 = (
  commanderId: PlayerId,
  sourceId: TerritoryId,
  targetId: TerritoryId,
  access: 'land' | 'naval' = 'land',
): FrontOperationV2 => ({
  commanderId,
  sourceId,
  targetId,
  doctrine: 'pressure',
  access,
  startedTick: 0,
  lastBattleTick: 0,
  holdUntilTick: 12,
  momentum: 0,
});

const warV2 = (
  state: WorldStateV2,
  attackerId: PlayerId,
  defenderId: PlayerId,
  operation?: FrontOperationV2,
  id = `war-trait-${attackerId}-${defenderId}`,
): WarStateV2 => {
  const active: WarStateV2 = {
    id,
    attackerId,
    defenderId,
    startedTick: 0,
    lastBattleTick: 0,
    warScore: 0,
    battles: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastPeaceOfferTick: -1_000_000,
    attackerOperations: operation ? [operation] : [],
    defenderOperations: [],
  };
  state.wars.push(active);
  return active;
};

const setArmyV2 = (
  state: WorldStateV2,
  territoryId: TerritoryId,
  manpower: number,
): void => {
  state.territories[territoryId]!.army.manpower = manpower;
  state.territories[territoryId]!.army.capacity = manpower;
};

describe('V2 country traits in the canonical war runtime', () => {
  it('uses the same access-scoped ATK exchange for forecasts and live resolution', () => {
    const colombia = nationIdV2('col');
    const ecuador = nationIdV2('ecu');
    const colombiaTerritory = territoryIdV2('col');
    const ecuadorTerritory = territoryIdV2('ecu');
    const state = createWorldStateV2(91_001);
    state.wars = [];
    setArmyV2(state, colombiaTerritory, 0.20);
    setArmyV2(state, ecuadorTerritory, 0.16);
    state.territories[colombiaTerritory]!.condition = 0.9;
    state.territories[ecuadorTerritory]!.condition = 0.9;

    const snapshot = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2);
    const rawAttack = selectEffectiveAttackV2(
      state,
      WORLD_CONTENT_V2,
      colombia,
      state.territories[colombiaTerritory]!.army,
      snapshot,
    );
    const land = projectCombatExchangeV2(
      state,
      WORLD_CONTENT_V2,
      colombia,
      ecuador,
      colombiaTerritory,
      ecuadorTerritory,
      'land',
      1,
      1,
      snapshot,
    )!;
    const naval = projectCombatExchangeV2(
      state,
      WORLD_CONTENT_V2,
      colombia,
      ecuador,
      colombiaTerritory,
      ecuadorTerritory,
      'naval',
      1,
      1,
      snapshot,
    )!;
    expect(land.attackerAttack).toBeCloseTo(rawAttack * 1.15, 9);
    expect(naval.attackerAttack).toBeCloseTo(rawAttack, 9);

    const forecast = forecastWarV2(state, WORLD_CONTENT_V2, colombia, ecuador, snapshot);
    expect(forecast.sourceId).toBe(colombiaTerritory);
    expect(forecast.targetId).toBe(ecuadorTerritory);
    expect(forecast.projectedAttackerLosses).toBeCloseTo(land.attackerLosses, 6);
    expect(forecast.projectedDefenderLosses).toBeCloseTo(land.defenderLosses, 6);

    const operation = operationV2(colombia, colombiaTerritory, ecuadorTerritory);
    const activeWar = warV2(state, colombia, ecuador, operation);
    const rng = { rngState: state.rngState };
    const varianceA = 0.94 + nextRandom(rng) * 0.12;
    const varianceD = 0.94 + nextRandom(rng) * 0.12;
    const randomized = projectCombatExchangeV2(
      state,
      WORLD_CONTENT_V2,
      colombia,
      ecuador,
      colombiaTerritory,
      ecuadorTerritory,
      'land',
      varianceA,
      varianceD,
    )!;
    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar, operation)!;
    expect(battle.attackerLosses).toBeCloseTo(randomized.attackerLosses, 6);
    expect(battle.defenderLosses).toBeCloseTo(randomized.defenderLosses, 6);
  });

  it('activates food-security defense and defender casualty reduction only below its threshold', () => {
    const cuba = nationIdV2('cub');
    const haiti = nationIdV2('hti');
    const cubaTerritory = territoryIdV2('cub');
    const haitiTerritory = territoryIdV2('hti');
    const state = createWorldStateV2(91_002);
    state.wars = [];
    setArmyV2(state, cubaTerritory, 0.18);
    setArmyV2(state, haitiTerritory, 0.18);
    const snapshot = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2);
    const rawDefense = selectEffectiveDefenseV2(
      state,
      WORLD_CONTENT_V2,
      haiti,
      state.territories[haitiTerritory]!.army,
      snapshot,
    );

    state.players[haiti]!.foodSecurity = 0.80;
    const stable = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, cuba, haiti,
      cubaTerritory, haitiTerritory, 'naval', 1, 1, snapshot,
    )!;
    state.players[haiti]!.foodSecurity = 0.79;
    const crisis = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, cuba, haiti,
      cubaTerritory, haitiTerritory, 'naval', 1, 1, snapshot,
    )!;

    expect(stable.defenderDefense).toBeCloseTo(rawDefense, 9);
    expect(crisis.defenderDefense).toBeCloseTo(rawDefense * 1.30, 9);
    expect(crisis.defenderLosses).toBeLessThan(stable.defenderLosses);
  });

  it('requires matching terrain, homeland and defender role and never stacks an absorbed trait', () => {
    const india = nationIdV2('ind');
    const nepal = nationIdV2('npl');
    const netherlands = nationIdV2('nld');
    const indiaTerritory = territoryIdV2('ind');
    const nepalTerritory = territoryIdV2('npl');
    expect(WORLD_CONTENT_V2.territories[nepalTerritory]!.terrain).toBe('mountain');

    const state = createWorldStateV2(91_003);
    state.wars = [];
    setArmyV2(state, indiaTerritory, 0.20);
    setArmyV2(state, nepalTerritory, 0.16);
    const snapshot = createMilitaryBaseSnapshotV2(state, WORLD_CONTENT_V2);
    const rawNepalDefense = selectEffectiveDefenseV2(
      state, WORLD_CONTENT_V2, nepal,
      state.territories[nepalTerritory]!.army, snapshot,
    );
    const defending = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, india, nepal,
      indiaTerritory, nepalTerritory, 'land', 1, 1, snapshot,
    )!;
    const attacking = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, nepal, india,
      nepalTerritory, indiaTerritory, 'land', 1, 1, snapshot,
    )!;
    expect(defending.defenderDefense).toBeCloseTo(rawNepalDefense * 1.22, 9);
    expect(attacking.attackerDefense).toBeCloseTo(rawNepalDefense, 9);

    // The formation and sovereign core still originate in Nepal, but the live
    // owner is Dutch. Only the Dutch trait may be queried after fusion.
    const absorbed = createWorldStateV2(91_004);
    absorbed.wars = [];
    absorbed.territories[nepalTerritory]!.owner = netherlands;
    absorbed.territories[nepalTerritory]!.coreOwner = nepal;
    absorbed.territories[nepalTerritory]!.integration = 1;
    delete absorbed.territories[nepalTerritory]!.integrationProgram;
    setArmyV2(absorbed, indiaTerritory, 0.20);
    setArmyV2(absorbed, nepalTerritory, 0.16);
    invalidateTerritoryIndexV2(absorbed);
    const absorbedSnapshot = createMilitaryBaseSnapshotV2(absorbed, WORLD_CONTENT_V2);
    const currentOwnerDefense = selectEffectiveDefenseV2(
      absorbed, WORLD_CONTENT_V2, netherlands,
      absorbed.territories[nepalTerritory]!.army, absorbedSnapshot,
    );
    const afterFusion = projectCombatExchangeV2(
      absorbed, WORLD_CONTENT_V2, india, netherlands,
      indiaTerritory, nepalTerritory, 'land', 1, 1, absorbedSnapshot,
    )!;
    expect(afterFusion.defenderDefense).toBeCloseTo(currentOwnerDefense, 9);
    expect(afterFusion.defenderDefense).not.toBeCloseTo(currentOwnerDefense * 1.22, 6);
  });

  it('applies attacker-side naval casualty reduction after the existing casualty formula', () => {
    const cyprus = nationIdV2('cyp');
    const turkey = nationIdV2('tur');
    const cyprusTerritory = territoryIdV2('cyp');
    const turkeyTerritory = territoryIdV2('tur');
    const state = createWorldStateV2(91_005);
    state.wars = [];
    setArmyV2(state, cyprusTerritory, 0.16);
    setArmyV2(state, turkeyTerritory, 0.16);
    const projection = projectCombatExchangeV2(
      state, WORLD_CONTENT_V2, cyprus, turkey,
      cyprusTerritory, turkeyTerritory, 'naval', 1, 1,
    )!;
    const casualtyLevel = state.players[cyprus]!.research.effectLevels['casualty-reduction'];
    const researchModifier = 1 - 0.50 * casualtyLevel / (casualtyLevel + 30);
    const expected = Math.min(
      state.territories[cyprusTerritory]!.army.manpower,
      projection.attackerStrength * COMBAT_DAMAGE_EFFECTIVENESS
        * Math.pow(projection.counterRatio, COMBAT_POWER_RATIO_EXPONENT)
        * WAR_ACCESS_CASUALTY_MULTIPLIER.naval
        * ATTACKER_MILITARY_LOSS_MULTIPLIER
        * researchModifier
        * 0.82,
    );
    expect(expected).toBeLessThan(projection.attackerStrength);
    expect(projection.attackerLosses).toBeCloseTo(expected, 9);
  });

  it('scales only front supply, land-hop pressure and naval-distance pressure components', () => {
    const saudiArabia = nationIdV2('sau');
    const russia = nationIdV2('rus');
    const southAfrica = nationIdV2('zaf');
    const netherlands = nationIdV2('nld');
    const saudiTerritory = territoryIdV2('sau');
    const russiaTerritory = territoryIdV2('rus');
    const ukraineTerritory = territoryIdV2('ukr');
    const southAfricaTerritory = territoryIdV2('zaf');
    const argentinaTerritory = territoryIdV2('arg');
    const netherlandsTerritory = territoryIdV2('nld');
    const state = createWorldStateV2(91_006);
    state.wars = [];

    state.territories[saudiTerritory]!.condition = 0.5;
    expect(WORLD_CONTENT_V2.territories[saudiTerritory]!.terrain).toBe('desert');
    const saudiResearch = 1 + 0.01 * state.players[saudiArabia]!.research.effectLevels.supply;
    expect(supplyFactorV2(
      state, WORLD_CONTENT_V2, saudiArabia, saudiTerritory, 'land',
    )).toBeCloseTo(0.8 * saudiResearch * 1.04, 9);

    state.territories[ukraineTerritory]!.owner = russia;
    state.territories[ukraineTerritory]!.condition = 0.5;
    expect(WORLD_CONTENT_V2.territories[russiaTerritory]!.connections
      .some((connection) => connection.targetId === ukraineTerritory)).toBe(true);
    const russianResearch = 1 + 0.01 * state.players[russia]!.research.effectLevels.supply;
    expect(supplyFactorV2(
      state, WORLD_CONTENT_V2, russia, ukraineTerritory, 'land',
    )).toBeCloseTo((1 - 0.035 * 0.90) * 0.8 * russianResearch, 9);

    state.territories[southAfricaTerritory]!.condition = 0.5;
    const routeDistance = selectTerritoryRouteDistanceKmV2(
      WORLD_CONTENT_V2, southAfricaTerritory, argentinaTerritory,
    );
    expect(routeDistance).toBeGreaterThan(1_500);
    const rawNavalSupply = warAccessSupplyMultiplierV2('naval', routeDistance);
    const adjustedNavalSupply = WAR_ACCESS_SUPPLY_MULTIPLIER.naval
      - (WAR_ACCESS_SUPPLY_MULTIPLIER.naval - rawNavalSupply) * 0.90;
    const southAfricaResearch = 1 + 0.01 * state.players[southAfrica]!.research.effectLevels.supply;
    expect(supplyFactorV2(
      state,
      WORLD_CONTENT_V2,
      southAfrica,
      southAfricaTerritory,
      'naval',
      argentinaTerritory,
    )).toBeCloseTo(0.8 * adjustedNavalSupply * southAfricaResearch, 9);

    state.territories[netherlandsTerritory]!.condition = 0.5;
    const dutchResearch = 1 + 0.01 * state.players[netherlands]!.research.effectLevels.supply;
    expect(supplyFactorV2(
      state, WORLD_CONTENT_V2, netherlands, netherlandsTerritory, 'land',
    )).toBeCloseTo(0.8 * dutchResearch, 9);
  });

  it('reduces only positive combat condition loss in the matching defensive homeland', () => {
    const serbia = nationIdV2('srb');
    const bosnia = nationIdV2('bih');
    const serbiaTerritory = territoryIdV2('srb');
    const bosniaTerritory = territoryIdV2('bih');
    const state = createWorldStateV2(91_007);
    state.wars = [];
    state.territories[serbiaTerritory]!.condition = 1;
    state.territories[bosniaTerritory]!.condition = 1;
    setArmyV2(state, serbiaTerritory, 0.16);
    setArmyV2(state, bosniaTerritory, 0.20);
    const targetCapacity = state.territories[bosniaTerritory]!.army.capacity;
    const operation = operationV2(serbia, serbiaTerritory, bosniaTerritory);
    const activeWar = warV2(state, serbia, bosnia, operation);
    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar, operation)!;
    expect(battle.conquered).toBe(false);
    const rawLoss = 0.005 + battle.defenderLosses / targetCapacity * 0.10;
    expect(state.territories[bosniaTerritory]!.condition)
      .toBeCloseTo(1 - rawLoss * 0.70, 6);
  });

  it('uses the defeated owner treasury factor and forwards capture access into integration', () => {
    const hungary = nationIdV2('hun');
    const switzerland = nationIdV2('che');
    const hungaryTerritory = territoryIdV2('hun');
    const switzerlandTerritory = territoryIdV2('che');
    const state = createWorldStateV2(91_008);
    state.wars = [];
    state.players[switzerland]!.treasury = 100;
    state.players[hungary]!.treasury = 0;
    setArmyV2(state, hungaryTerritory, 0.20);
    for (const territory of Object.values(state.territories)) {
      if (territory.owner === switzerland) territory.army.manpower = 0;
    }
    const quote = quoteTerritoryIntegrationV2(
      state,
      WORLD_CONTENT_V2,
      switzerlandTerritory,
      hungary,
      { cause: 'conquest', access: 'land' },
    );
    const operation = operationV2(
      hungary, hungaryTerritory, switzerlandTerritory, 'land',
    );
    const activeWar = warV2(state, hungary, switzerland, operation);
    const battle = resolveBattlePulseV2(state, WORLD_CONTENT_V2, activeWar, operation)!;

    expect(battle.conquered).toBe(true);
    expect(battle.treasurySeized).toBe(10);
    expect(state.players[hungary]!.treasury).toBe(10);
    expect(state.players[switzerland]!.treasury).toBe(0);
    expect(state.territories[switzerlandTerritory]!.integrationProgram?.completesTick)
      .toBe(state.tick + quote.durationWeeks);
  });

  it('scales battle, capture, accepted-ceasefire and post-war fatigue gains', () => {
    const saudiArabia = nationIdV2('sau');
    const yemen = nationIdV2('yem');
    const saudiTerritory = territoryIdV2('sau');
    const yemenTerritory = territoryIdV2('yem');
    const battleState = createWorldStateV2(91_009);
    battleState.wars = [];
    battleState.players[saudiArabia]!.warFatigue = 0;
    setArmyV2(battleState, saudiTerritory, 0.10);
    setArmyV2(battleState, yemenTerritory, 0.20);
    const battleOperation = operationV2(
      saudiArabia, saudiTerritory, yemenTerritory, 'land',
    );
    const activeBattleWar = warV2(
      battleState, saudiArabia, yemen, battleOperation,
    );
    const attackerManpowerBefore = battleState.territories[saudiTerritory]!.army.manpower;
    const battle = resolveBattlePulseV2(
      battleState, WORLD_CONTENT_V2, activeBattleWar, battleOperation,
    )!;
    expect(battle.conquered).toBe(false);
    const attackerCapacity = selectTotalManpowerV2(battleState, saudiArabia).capacity;
    const exactAttackerLoss = attackerManpowerBefore
      - battleState.territories[saudiTerritory]!.army.manpower;
    expect(battleState.players[saudiArabia]!.warFatigue).toBeCloseTo(
      (0.08 + 4 * exactAttackerLoss / attackerCapacity) * 0.96,
      6,
    );

    const russia = nationIdV2('rus');
    const estonia = nationIdV2('est');
    const russiaTerritory = territoryIdV2('rus');
    const estoniaTerritory = territoryIdV2('est');
    const captureState = createWorldStateV2(91_010);
    captureState.wars = [];
    captureState.players[russia]!.warFatigue = 0;
    setArmyV2(captureState, russiaTerritory, 0.20);
    for (const territory of Object.values(captureState.territories)) {
      if (territory.owner === estonia) territory.army.manpower = 0;
    }
    const captureOperation = operationV2(
      russia, russiaTerritory, estoniaTerritory, 'land',
    );
    const activeCaptureWar = warV2(
      captureState, russia, estonia, captureOperation,
    );
    const capture = resolveBattlePulseV2(
      captureState, WORLD_CONTENT_V2, activeCaptureWar, captureOperation,
    )!;
    expect(capture.conquered).toBe(true);
    expect(capture.attackerLosses).toBe(0);
    expect(captureState.players[russia]!.warFatigue).toBeCloseTo(
      (0.5 + 0.08) * 0.96,
      6,
    );

    const peaceState = createWorldStateV2(91_011);
    peaceState.wars = [];
    peaceState.offers = [];
    peaceState.truces = [];
    peaceState.players[saudiArabia]!.warFatigue = 0;
    peaceState.players[yemen]!.warFatigue = 0;
    const peaceWar = warV2(peaceState, saudiArabia, yemen, undefined, 'war-trait-peace');
    peaceState.offers.push({
      id: 'offer-trait-peace',
      fromId: saudiArabia,
      toId: yemen,
      warId: peaceWar.id,
      settlement: 'ceasefire',
      createdTick: 0,
      expiresTick: 10,
      status: 'pending',
      weeklyCost: 0,
      paymentWeeks: 52,
    });
    expect(respondToOfferV2(
      peaceState, WORLD_CONTENT_V2, 'offer-trait-peace', true,
    ).accepted).toBe(true);
    expect(peaceState.players[saudiArabia]!.warFatigue).toBeCloseTo(
      (2 + POST_WAR_TRANSITION_FATIGUE) * 0.96,
      6,
    );
    expect(peaceState.players[yemen]!.warFatigue).toBeCloseTo(
      POST_WAR_TRANSITION_FATIGUE,
      6,
    );
  });
});
