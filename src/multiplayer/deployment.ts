import {
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
  type CommanderProfileV1,
} from '../meta/commanderProfile';
import { synchronizeArmyCapacityV2 } from '../sim/v2/capacity';
import {
  registerCountryMasteryRuntimeV2,
  resetCountryMasteryRuntimeV2,
} from '../sim/v2/countryMasteryRuntime';
import { processRogueAiSurvivalV2 } from '../sim/v2/survival';
import {
  balanceSurvivalRogueAgainstDawnlineV2,
  prepareMultiplayerSurvivalRosterV2,
  fundSurvivalRogueWarChestV2,
} from '../sim/v2/survivalEmpire';
import {
  nationIdV2,
  type CommandResultV2,
  type PlayerId,
  type WorldStateV2,
} from '../sim/v2/types';
import { synchronizeWarFrontsV2 } from '../sim/v2/war';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION,
  validateMultiplayerDeploymentSnapshotV1,
  type MultiplayerDeploymentSnapshotV1,
} from './protocol';

/** Safe neutral fallback for tests and profile-less private-room integrations. */
export function createNeutralMultiplayerDeploymentSnapshotV1(
  countryId: string | PlayerId,
): MultiplayerDeploymentSnapshotV1 {
  return {
    schemaVersion: MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION,
    countryId: nationIdV2(countryId),
    empireFlag: { kind: 'country', countryId: nationIdV2(countryId) },
    activeDoctrine: null,
    countryMastery: {
      openingArmyMultiplier: 1,
      armyCapacityMultiplier: 1,
      attackMultiplier: 1,
      defenseMultiplier: 1,
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
      landSupplyMultiplier: 1,
      landTransferThroughputMultiplier: 1,
      navalSupplyMultiplier: 1,
      navalTransferThroughputMultiplier: 1,
      navalTransferCostMultiplier: 1,
      recruitmentCostMultiplier: 1,
      standingOperatingCostMultiplier: 1,
      casualtyMultiplier: 1,
    },
    apex: {
      shield: {
        integrity: 0.0004,
        maxIntegrity: 0.0004,
        rechargeBuffer: 0.00004,
        rechargeMultiplier: 1,
        pulseAttack: 0.001,
        pulseProjectionRetention: 0,
        pulseChargeBonusPerStep: 0,
        interceptEfficiency: 1,
        impactRecoveryShare: 0,
        defensivePulseMultiplier: 1,
      },
      attackMultiplier: 1.12,
      defenseMultiplier: 1.07,
      armyCasualtyMultiplier: 1,
      armyPeaceRecoveryMultiplier: 1,
      treasury: 0,
      annualOutput: 0.015,
      supplyStock: 0.010,
      countryTraitScale: 0,
      capabilities: {
        mobileHeadquarters: false,
        fieldHospital: false,
        rapidResponse: false,
        assaultSpecialist: false,
        defenseSpecialist: false,
        forceMultiplier: false,
        emergencyExtractionCharges: 0,
      },
      empireSupport: {
        recruitmentMultiplier: 1,
        reserveTrainingMultiplier: 1,
        armyCasualtyMultiplier: 1,
        armyPeaceRecoveryMultiplier: 1,
        annualFoodOutput: 0,
        foodProductionMultiplier: 1,
        foodStorageMultiplier: 1,
        foodImportCostMultiplier: 1,
      },
    },
  };
}

/** Resolves the local account once; editable profile data never crosses wire. */
export function createMultiplayerDeploymentSnapshotV1(
  profile: CommanderProfileV1,
  countryId: string | PlayerId,
): MultiplayerDeploymentSnapshotV1 {
  const canonicalCountryId = nationIdV2(countryId);
  const loadout = resolveCountryLoadoutV1(profile, canonicalCountryId);
  return validateMultiplayerDeploymentSnapshotV1({
    schemaVersion: MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION,
    countryId: canonicalCountryId,
    empireFlag: profile.empireFlag,
    activeDoctrine: loadout.activeDoctrine,
    countryMastery: {
      openingArmyMultiplier: loadout.masteryMilitary.openingArmyMultiplier,
      armyCapacityMultiplier: loadout.masteryMilitary.armyCapacityMultiplier,
      attackMultiplier: loadout.masteryMilitary.attackMultiplier,
      defenseMultiplier: loadout.masteryMilitary.defenseMultiplier,
      recruitmentMultiplier: loadout.masteryMilitary.recruitmentMultiplier,
      reserveTrainingMultiplier: loadout.masteryMilitary.reserveTrainingMultiplier,
      landSupplyMultiplier: loadout.masteryMilitary.landSupplyMultiplier,
      landTransferThroughputMultiplier: loadout.masteryMilitary.landTransferThroughputMultiplier,
      navalSupplyMultiplier: loadout.masteryMilitary.navalSupplyMultiplier,
      navalTransferThroughputMultiplier: loadout.masteryMilitary.navalTransferThroughputMultiplier,
      navalTransferCostMultiplier: loadout.masteryMilitary.navalTransferCostMultiplier,
      recruitmentCostMultiplier: loadout.masteryMilitary.recruitmentCostMultiplier,
      standingOperatingCostMultiplier: loadout.masteryMilitary.standingOperatingCostMultiplier,
      casualtyMultiplier: loadout.masteryMilitary.casualtyMultiplier,
    },
    apex: resolveCommanderForceInitializationV1(loadout),
  });
}

/** Reinstalls deterministic runtime-only mastery before a guest replica moves. */
export function registerMultiplayerDeploymentRuntimeV1(
  content: WorldEngineV2['content'],
  deployments: ReadonlyMap<PlayerId, MultiplayerDeploymentSnapshotV1>,
): void {
  resetCountryMasteryRuntimeV2(content);
  for (const [countryId, deployment] of [...deployments]
    .sort(([left], [right]) => left.localeCompare(right))) {
    if (deployment.countryId !== countryId || !content.nations[countryId]) {
      throw new Error(`Multiplayer deployment does not match seat ${countryId}.`);
    }
    registerCountryMasteryRuntimeV2(content, countryId, deployment.countryMastery);
  }
}

export interface SurvivalCoopSeatRolesV1 {
  readonly hostCommanderId: PlayerId;
  readonly alliedCommanderId: PlayerId;
}

/** Human co-op seats are equal sovereign commands inside one shared Survival line. */
export function resolveSurvivalCoopSeatRolesV1(
  state: Pick<WorldStateV2, 'humanPlayerId' | 'humanPlayerIds' | 'players'>,
): SurvivalCoopSeatRolesV1 | undefined {
  const humanIds = [...new Set(state.humanPlayerIds)]
    .sort((left, right) => left.localeCompare(right));
  if (humanIds.length !== 2 || !humanIds.includes(state.humanPlayerId)) return undefined;
  const alliedCommanderId = humanIds.find((playerId) => playerId !== state.humanPlayerId);
  if (!alliedCommanderId || !state.players[state.humanPlayerId]
    || !state.players[alliedCommanderId]) return undefined;
  return {
    hostCommanderId: state.humanPlayerId,
    alliedCommanderId,
  };
}

/**
 * Tick-zero host authority: all chosen countries keep their own mastery and
 * receive their own APEX. Survival never expands these seats to a solo roster.
 */
export function applyMultiplayerDeploymentsV1(
  engine: WorldEngineV2,
  deployments: ReadonlyMap<PlayerId, MultiplayerDeploymentSnapshotV1>,
): CommandResultV2 {
  const humanIds = [...engine.state.humanPlayerIds]
    .sort((left, right) => left.localeCompare(right));
  const deployedIds = [...deployments.keys()]
    .sort((left, right) => left.localeCompare(right));
  if (engine.state.tick !== 0 || humanIds.length !== deployedIds.length
    || humanIds.some((countryId, index) => countryId !== deployedIds[index])) {
    return { accepted: false, reason: 'Every co-op seat needs one matching tick-zero deployment.' };
  }

  try {
    registerMultiplayerDeploymentRuntimeV1(engine.content, deployments);
  } catch (error) {
    return {
      accepted: false,
      reason: error instanceof Error ? error.message : 'Country Mastery could not be registered.',
    };
  }

  if (engine.content.metadata?.scenarioId === 'survival') {
    const prepared = prepareMultiplayerSurvivalRosterV2(
      engine.state,
      engine.content,
      humanIds,
    );
    if (!prepared.accepted) return prepared;
  }

  for (const countryId of humanIds) {
    const deployment = deployments.get(countryId)!;
    const nation = engine.state.players[countryId];
    if (!nation) return { accepted: false, reason: `${countryId} is no longer an active co-op nation.` };
    // Compatibility field only; deployment strength now lives entirely in
    // territorial active formations and their capacity.
    nation.trainedReserves = 0;
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner !== countryId) continue;
      territory.army.manpower *= deployment.countryMastery.openingArmyMultiplier
        * deployment.countryMastery.armyCapacityMultiplier;
    }
    const apex = engine.initializeCommanderForce(countryId, deployment.apex);
    if (!apex.accepted) return {
      accepted: false,
      reason: apex.reason ?? `EONSCAR could not deploy for ${countryId}.`,
    };
  }
  synchronizeArmyCapacityV2(engine.state, engine.content);
  if (engine.content.metadata?.scenarioId === 'survival') {
    balanceSurvivalRogueAgainstDawnlineV2(engine.state, engine.content);
    processRogueAiSurvivalV2(engine.state, engine.content);
    synchronizeWarFrontsV2(engine.state, engine.content);
    fundSurvivalRogueWarChestV2(engine.state, engine.content);
  }
  return { accepted: true };
}
