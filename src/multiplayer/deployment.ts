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
import { prepareMultiplayerSurvivalRosterV2 } from '../sim/v2/survivalEmpire';
import { nationIdV2, type CommandResultV2, type PlayerId } from '../sim/v2/types';
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
      // Compatibility keys: current / maximum neural-shield integrity.
      manpower: 0.0008,
      capacity: 0.0008,
      trainedReserves: 0.00008,
      baseAttack: 125,
      baseDefense: 125,
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
        emergencyExtractionCharges: 0,
      },
      empireSupport: {
        recruitmentMultiplier: 1,
        reserveTrainingMultiplier: 1,
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
    nation.trainedReserves *= deployment.countryMastery.armyCapacityMultiplier;
    for (const territory of Object.values(engine.state.territories)) {
      if (territory.owner !== countryId) continue;
      territory.army.manpower *= deployment.countryMastery.openingArmyMultiplier
        * deployment.countryMastery.armyCapacityMultiplier;
    }
    const apex = engine.initializeCommanderForce(countryId, deployment.apex);
    if (!apex.accepted) return {
      accepted: false,
      reason: apex.reason ?? `APEX could not deploy for ${countryId}.`,
    };
  }
  synchronizeArmyCapacityV2(engine.state, engine.content);
  return { accepted: true };
}
