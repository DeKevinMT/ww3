import {
  FOOD_DOMESTIC_CAPACITY_RAMP_WEEKS,
  PEACE_FATIGUE_RECOVERY_PER_WEEK,
  clamp,
  round,
} from './balance';
import {
  territoryTerrainConditionRecoveryMultiplierV2,
  type WorldContentV2,
} from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { consumeOpeningArmyBonusLossV2 } from './openingArmyBonus';
import {
  advanceTerritoryIntegrationProgramsV2,
  type IntegrationCompletionV2,
} from './integration';
import {
  createPowerSnapshotV2,
  projectFinanceManpowerPhaseV2,
  selectFoodDomesticCapacityTargetV2,
  selectPopulationDynamicsV2,
  selectTerritoriesOfV2,
  selectWarsOfV2,
  selectWeeklyFinanceBreakdownV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
import {
  composeTraitContextV2,
  traitContextForTerritoryOwnerV2,
  traitNationContextV2,
  traitTerritoryFrontAccessV2,
} from './traitContext';
import { countryTraitFactorV2 } from './traits';
import type { PlayerId, WeeklyFinanceBreakdownV2, WorldStateV2 } from './types';

export type FinancePlansV2 = ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2>;

/** One bounded weekly step toward the live domestic food-system target. */
export function advanceDomesticFoodCapacityV2(current: number, target: number): number {
  const safeCurrent = Math.max(0, current);
  const safeTarget = Math.max(0, target);
  const maximumStep = Math.max(safeCurrent, safeTarget, 0.000001)
    / FOOD_DOMESTIC_CAPACITY_RAMP_WEEKS;
  if (Math.abs(safeTarget - safeCurrent) <= maximumStep) return round(safeTarget, 9);
  return round(safeCurrent + Math.sign(safeTarget - safeCurrent) * maximumStep, 9);
}

export function createFinancePlansV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): Map<PlayerId, WeeklyFinanceBreakdownV2> {
  return new Map(sortedNationIdsV2(state)
    // Defeated identities stay referenced while their old cores integrate, but
    // they own no economy and every commit phase already skips them. Avoid a
    // full finance projection for these dormant records in long campaigns.
    .filter((id) => selectTerritoriesOfV2(state, id).length > 0)
    .map((id) => [id, selectWeeklyFinanceBreakdownV2(state, content, id, powerSnapshot)]));
}

function processMilitaryAndCondition(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance: WeeklyFinanceBreakdownV2,
): void {
  const atWar = selectWarsOfV2(state, playerId).length > 0;
  const territories = selectTerritoriesOfV2(state, playerId);
  const projectedArmy = projectFinanceManpowerPhaseV2(state, content, playerId, finance);
  state.players[playerId]!.trainedReserves = projectedArmy.trainedReservesAfter;
  const projectedByTerritory = new Map(projectedArmy.territories.map((army) => [army.id, army]));
  for (const view of territories) {
    const territory = state.territories[view.id]!;
    const projected = projectedByTerritory.get(view.id);
    if (projected) {
      territory.army.capacity = projected.capacity;
      territory.army.manpower = projected.manpower;
      territory.army.baseAttack = projected.baseAttack;
      territory.army.baseDefense = projected.baseDefense;
    }
    const isConquered = territory.coreOwner !== territory.owner;
    // Newly conquered infrastructure cannot recover at homeland speed. Restoration
    // accelerates only as administration and local supply chains return.
    const reconstructionReadiness = isConquered
      ? 0.18 + 0.82 * clamp(territory.integration, 0, 1)
      : 1;
    const traitOwner = traitContextForTerritoryOwnerV2(state, content, view.id);
    const conditionRecoveryFactor = traitOwner?.playerId === playerId
      ? countryTraitFactorV2(
        playerId,
        'condition-recovery',
        composeTraitContextV2(traitOwner.context, {
          access: traitTerritoryFrontAccessV2(state, playerId, view.id),
        }),
      )
      : 1;
    const conditionGain = 0.006 * finance.conditionFundingRatio * finance.aiEfficiency
      * (atWar ? 0.35 : 1) * reconstructionReadiness * conditionRecoveryFactor
      * territoryTerrainConditionRecoveryMultiplierV2(content, view.id);
    territory.condition = round(clamp(territory.condition + conditionGain, 0.15, 1));
  }
  consumeOpeningArmyBonusLossV2(state, playerId, projectedArmy.demobilized);
}

function processDevelopment(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance: WeeklyFinanceBreakdownV2,
): void {
  const territories = selectTerritoriesOfV2(state, playerId);
  if (territories.length === 0) return;
  const annualEconomy = finance.annualEconomyGrowthRate;
  const populationDynamics = selectPopulationDynamicsV2(
    state,
    content,
    playerId,
    finance.populationGrowth,
    finance.foodTargetStock,
  );
  const economyMultiplier = Math.max(0, 1 + annualEconomy) ** (1 / 52);
  for (const view of territories) {
    const territory = state.territories[view.id]!;
    const populationMultiplier = (1 + populationDynamics.annualNetRate) ** (1 / 52);
    territory.economy = round(Math.max(0.10, territory.economy * economyMultiplier));
    territory.population = round(Math.max(0.01, territory.population * populationMultiplier));
  }
}

export function processEconomyV2(
  state: WorldStateV2,
  content: WorldContentV2,
  financePlans: FinancePlansV2 = createFinancePlansV2(state, content),
): void {
  processFinanceMilitaryV2(state, content, financePlans);
  processDevelopmentPhaseV2(state, content, financePlans);
}

export function processFinanceMilitaryV2(
  state: WorldStateV2,
  content: WorldContentV2,
  financePlans: FinancePlansV2,
): IntegrationCompletionV2[] {
  synchronizeArmyCapacityV2(state, content);
  // Snapshot every target before nation finance mutates stocks, armies and
  // conditions. Capacity then takes one slow step after the current week's
  // domestic/import mix has already been funded.
  const domesticCapacityTargets = new Map(sortedNationIdsV2(state).flatMap((playerId) => (
    selectTerritoriesOfV2(state, playerId).length > 0
      ? [[playerId, selectFoodDomesticCapacityTargetV2(state, content, playerId)] as const]
      : []
  )));
  for (const playerId of sortedNationIdsV2(state)) {
    if (selectTerritoriesOfV2(state, playerId).length === 0) continue;
    const nation = state.players[playerId]!;
    const finance = financePlans.get(playerId) ?? selectWeeklyFinanceBreakdownV2(state, content, playerId);
    nation.treasury = round(finance.closingTreasury);
    nation.foodStock = round(clamp(
      nation.foodStock + finance.foodStockChange,
      0,
      finance.foodStorageCapacity,
    ));
    nation.foodSecurity = round(clamp(finance.foodCoverage, 0, 1));
    // Personnel are projected and then committed by one shared rule path
    // inside processMilitaryAndCondition. This keeps the
    // visible weekly manpower delta identical to the canonical peace update.
    processMilitaryAndCondition(state, content, playerId, finance);
    if (selectWarsOfV2(state, playerId).length === 0) {
      const fatigueRecovery = PEACE_FATIGUE_RECOVERY_PER_WEEK
        * countryTraitFactorV2(
          playerId,
          'war-fatigue-recovery',
          traitNationContextV2(state, playerId),
        );
      nation.warFatigue = round(Math.max(0, nation.warFatigue - fatigueRecovery));
    }
  }
  for (const [playerId, target] of domesticCapacityTargets) {
    const nation = state.players[playerId];
    if (!nation) continue;
    nation.domesticFoodCapacity = advanceDomesticFoodCapacityV2(
      nation.domesticFoodCapacity,
      target,
    );
  }
  state.ceasefireObligations = state.ceasefireObligations
    .filter((obligation) => obligation.expiresTick > state.tick
      && selectTerritoriesOfV2(state, obligation.payerId).length > 0
      && selectTerritoriesOfV2(state, obligation.payeeId).length > 0);
  // Complete fusion after this week's precomputed finance has been committed.
  // Otherwise the old plan would overwrite reserves or national stores that
  // have just transferred from the retired country.
  const integrationCompletions = advanceTerritoryIntegrationProgramsV2(state, content);
  synchronizeArmyCapacityV2(state, content);
  return integrationCompletions;
}

export function processDevelopmentPhaseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  financePlans: FinancePlansV2,
): void {
  for (const playerId of sortedNationIdsV2(state)) {
    if (selectTerritoriesOfV2(state, playerId).length === 0) continue;
    const finance = financePlans.get(playerId) ?? selectWeeklyFinanceBreakdownV2(state, content, playerId);
    processDevelopment(state, content, playerId, finance);
  }
  synchronizeArmyCapacityV2(state, content);
}
