import {
  PEACE_FATIGUE_RECOVERY_PER_WEEK,
  round,
} from './balance';
import type { WorldContentV2 } from './content';
import { synchronizeArmyCapacityV2 } from './capacity';
import { consumeOpeningArmyBonusLossV2 } from './openingArmyBonus';
import {
  advanceTerritoryIntegrationProgramsV2,
  type IntegrationCompletionV2,
} from './integration';
import {
  createPowerSnapshotV2,
  projectFinanceManpowerPhaseV2,
  isSurvivalScorchedTransitTerritoryV2,
  selectIsEliminatedV2,
  selectPopulationDynamicsV2,
  selectTerritoriesOfV2,
  selectWarsOfV2,
  selectWeeklyFinanceBreakdownV2,
  sortedNationIdsV2,
  type PowerSnapshotV2,
} from './selectors';
import { normalizeRetiredFoodCompatibilityV2 } from './retiredFood';
import { normalizeRetiredReserveCompatibilityV2 } from './retiredReserves';
import { traitNationContextV2 } from './traitContext';
import { countryTraitFactorV2 } from './traits';
import { isNationOperationalV2 } from './survival';
import { enforceSurvivalScorchedWorldV2 } from './survivalEmpire';
import {
  reconcileRogueWaveManpowerAfterChangeV2,
} from './survivalProvenance';
import type { PlayerId, WeeklyFinanceBreakdownV2, WorldStateV2 } from './types';

export type FinancePlansV2 = ReadonlyMap<PlayerId, WeeklyFinanceBreakdownV2>;

export function createFinancePlansV2(
  state: WorldStateV2,
  content: WorldContentV2,
  powerSnapshot: PowerSnapshotV2 = createPowerSnapshotV2(state, content),
): Map<PlayerId, WeeklyFinanceBreakdownV2> {
  return new Map(sortedNationIdsV2(state)
    // Defeated identities stay referenced while their old cores integrate, but
    // they own no economy and every commit phase already skips them. Avoid a
    // full finance projection for these dormant records in long campaigns.
    .filter((id) => !selectIsEliminatedV2(state, id)
      && isNationOperationalV2(state, content, id))
    .map((id) => [id, selectWeeklyFinanceBreakdownV2(state, content, id, powerSnapshot)]));
}

function processMilitary(
  state: WorldStateV2,
  content: WorldContentV2,
  playerId: PlayerId,
  finance: WeeklyFinanceBreakdownV2,
): void {
  const territories = selectTerritoriesOfV2(state, playerId);
  const projectedArmy = projectFinanceManpowerPhaseV2(state, content, playerId, finance);
  state.players[playerId]!.trainedReserves = 0;
  const projectedByTerritory = new Map(projectedArmy.territories.map((army) => [army.id, army]));
  for (const view of territories) {
    const territory = state.territories[view.id]!;
    const manpowerBeforeFinance = territory.army.manpower;
    const projected = projectedByTerritory.get(view.id);
    if (projected) {
      territory.army.capacity = projected.capacity;
      territory.army.manpower = projected.manpower;
      territory.army.baseAttack = projected.baseAttack;
      territory.army.baseDefense = projected.baseDefense;
    }
    // Ordinary Antarctic recruitment rebuilds the defensive empire only. New
    // reward-eligible/offensive provenance is committed exclusively by the
    // annual five-percent wave scheduler; finance may preserve or shrink an
    // existing formation, never create one silently every week.
    reconcileRogueWaveManpowerAfterChangeV2(
      state,
      view.id,
      manpowerBeforeFinance,
    );
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
  );
  const economyMultiplier = Math.max(0, 1 + annualEconomy) ** (1 / 52);
  for (const view of territories) {
    if (isSurvivalScorchedTransitTerritoryV2(state, view.id)) continue;
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
  normalizeRetiredFoodCompatibilityV2(state);
  normalizeRetiredReserveCompatibilityV2(state);
  synchronizeArmyCapacityV2(state, content);
  const playerIds = sortedNationIdsV2(state);
  for (const playerId of playerIds) {
    if (selectIsEliminatedV2(state, playerId)
      || !isNationOperationalV2(state, content, playerId)) continue;
    const nation = state.players[playerId]!;
    const finance = financePlans.get(playerId) ?? selectWeeklyFinanceBreakdownV2(state, content, playerId);
    nation.treasury = round(finance.closingTreasury);
    // Personnel are projected and then committed by one shared rule path
    // inside processMilitary. This keeps the
    // visible weekly manpower delta identical to the canonical peace update.
    processMilitary(state, content, playerId, finance);
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
  state.ceasefireObligations = [];
  // Complete fusion after this week's precomputed finance has been committed.
  // Otherwise the old plan would overwrite reserves or national stores that
  // have just transferred from the retired country.
  const integrationCompletions = advanceTerritoryIntegrationProgramsV2(state, content);
  normalizeRetiredFoodCompatibilityV2(state);
  normalizeRetiredReserveCompatibilityV2(state);
  synchronizeArmyCapacityV2(state, content);
  return integrationCompletions;
}

export function processDevelopmentPhaseV2(
  state: WorldStateV2,
  content: WorldContentV2,
  financePlans: FinancePlansV2,
): void {
  for (const playerId of sortedNationIdsV2(state)) {
    if (selectIsEliminatedV2(state, playerId)
      || !isNationOperationalV2(state, content, playerId)) continue;
    const finance = financePlans.get(playerId) ?? selectWeeklyFinanceBreakdownV2(state, content, playerId);
    processDevelopment(state, content, playerId, finance);
  }
  enforceSurvivalScorchedWorldV2(state, content);
  synchronizeArmyCapacityV2(state, content);
}
