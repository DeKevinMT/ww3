import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  EMPTY_RESEARCH_BREAKTHROUGHS,
  EMPTY_RESEARCH_EFFECT_LEVELS,
  EMPTY_RESEARCH_PROGRESS,
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  RESEARCH_BRANCHES,
  V2_CONTENT_VERSION,
  V2_MAP_ID,
  V2_RULES_VERSION,
  WAR_CAMPAIGN_MAX_TICKS,
  clamp,
  round,
} from './balance';
import { createWorldStateV2, openingConflictScheduleV2 } from './bootstrap';
import { pruneAllianceStateV2 } from './alliances';
import { normalizeMandatoryApexAnalysisV2 } from './apexNarrative';
import { synchronizeArmyCapacityV2 } from './capacity';
import {
  cloneCommanderForcesV2,
  migrateLegacyCommanderEconomiesV2,
  normalizeApexCapstoneProtocolV2,
  reconcileCommanderForcesV2,
} from './commanderForce';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  type WorldContentV2,
} from './content';
import {
  absorbedNationSuccessorV2,
  retireDormantAbsorbedNationsV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { assertInvariantsV2 } from './invariants';
import { selectHumanEmpireDefeatWinnerV2 } from './humanPlayers';
import {
  synchronizeOpeningArmyHumanRosterV2,
  trackExistingOpeningArmyHumanRosterV2,
} from './nationState';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import { normalizeRetiredFoodCompatibilityV2 } from './retiredFood';
import { normalizeRetiredReserveCompatibilityV2 } from './retiredReserves';
import {
  cloneResearchDirectionsV2,
  createDefaultResearchDirectionsV2,
  defaultResearchDirectionForBranchV2,
  researchCategoryForDirectionV2,
} from './researchDirections';
import {
  clonePolarEndgameV2,
  createInitialPolarEndgameV2,
  selectPolarVictoryWinnerV2,
} from './polarEndgame';
import {
  cloneRunProgressionV2,
  createInitialRunProgressionV2,
  synchronizeRunProgressionRosterV2,
} from './runProgression';
import { contentVersionForWorldContentV2 } from './scenarios';
import {
  invalidateNationIndexV2,
  invalidateTerritoryIndexV2,
  selectFoodDomesticCapacityTargetV2,
} from './selectors';
import { activateRogueAiSurvivalV2 } from './survival';
import { enforceSurvivalScorchedWorldV2 } from './survivalEmpire';
import { reconcileSurvivalRogueFocusWarsV2 } from './survivalRogueFocus';
import { registerTraitContentV2 } from './traits';
import { canonicalizeWarFrontV2 } from './war';
import type {
  AiEscalationStateV2,
  AllianceOfferV2,
  AllianceV2,
  CeasefireObligationV2,
  CommanderForceStateV2,
  FrontOperationV2,
  IntegrationProgramStateV2,
  NationStateV2,
  PeaceOfferV2,
  PlayerId,
  PolarEndgameStateV2,
  ResearchBranchV2,
  RunProgressionStateV2,
  TerritoryId,
  TerritoryStateV2,
  TruceStateV2,
  WarStateV2,
  WorldStateV2,
} from './types';

export interface SaveGameV2 {
  schemaVersion: 22;
  rulesVersion: string;
  contentVersion: string;
  mapId: string;
  seed: number;
  rngState: number;
  tick: number;
  actionSequence: number;
  humanPlayerId: PlayerId;
  humanPlayerIds: PlayerId[];
  firstIntegrationDiscountUsedBy: PlayerId[];
  commanderForces: WorldStateV2['commanderForces'];
  players: Record<PlayerId, NationStateV2>;
  territories: Record<TerritoryId, TerritoryStateV2>;
  wars: WarStateV2[];
  truces: TruceStateV2[];
  ceasefireObligations: CeasefireObligationV2[];
  offers: PeaceOfferV2[];
  alliances: AllianceV2[];
  allianceOffers: AllianceOfferV2[];
  aiEscalation: AiEscalationStateV2;
  polarEndgame: PolarEndgameStateV2;
  runProgression: RunProgressionStateV2;
  nextEventId: number;
  nextWarId: number;
  nextOfferId: number;
  canonicalStateHash: string;
}

const LEGACY_RULES_VERSION_V13 = 'frontier-command-v2.48-canonical-tax';
const LEGACY_RULES_VERSION_V14 = 'frontier-command-v2.49-veteran-forces';
const LEGACY_RULES_VERSION_V15 = 'frontier-command-v2.50-mixed-armies';
const LEGACY_RULES_VERSION_V16 = 'frontier-command-v2.51-fixed-manual-actions';
const LEGACY_RULES_VERSION_V17 = 'frontier-command-v2.52-integration-multifront';
const LEGACY_RULES_VERSION_V18 = 'frontier-command-v2.53-combat-experience';
const LEGACY_RULES_VERSION_V19 = 'frontier-command-v2.54-faster-integration';
const LEGACY_RULES_VERSION_V20 = 'frontier-command-v2.55-combat-rebalance';
const LEGACY_RULES_VERSION_V20_RESEARCH = 'frontier-command-v2.56-research-expansion';
const LEGACY_RULES_VERSION_V21 = 'frontier-command-v2.57-performance-multiplayer';
/** Last authenticated schema-22 release before the V2.60 rule rebalance. */
const LEGACY_RULES_VERSION_V22 = 'frontier-command-v2.59-country-traits';
/**
 * Last authenticated schema-22 release before Random World and opening human
 * forces. Its former revolt chance was derived rather than persisted, so
 * loading this ruleset into the current engine safely leaves every active
 * Signal Purge intact without carrying a hidden scheduled event forward.
 */
const LEGACY_RULES_VERSION_V22_PRE_RANDOM = 'frontier-command-v2.60-revolutions-debt';
/** Random World release whose boosted human armies did not yet track expiry. */
const LEGACY_RULES_VERSION_V22_RANDOM = 'frontier-command-v2.61-random-world';
/** Temporary opening-army release whose free surplus still faded over ten years. */
const LEGACY_RULES_VERSION_V22_TEMPORARY = 'frontier-command-v2.62-temporary-opening-armies';
const LEGACY_OPENING_ARMY_BONUS_DURATION_TICKS_V2 = 1_040;
const LEGACY_WAR_CAMPAIGN_MAX_TICKS_V2 = 156;
/** Last authenticated schema-22 release before the Arctic/Antarctic campaign. */
const LEGACY_RULES_VERSION_V22_PRE_POLAR = 'frontier-command-v2.64-war-strain-counterattacks';
/** Complete polar schema-22 release before the V2.66 strategic rebalance. */
const LEGACY_RULES_VERSION_V22_POLAR = 'frontier-command-v2.65-polar-endgame';
/** Last v7-content release before real Antarctic territories and Survival. */
const LEGACY_RULES_VERSION_V22_66 = 'frontier-command-v2.66-strategic-rebalance';
/** Survival release immediately before the non-territorial APEX network became canonical. */
const LEGACY_RULES_VERSION_V22_67 = 'frontier-command-v2.67-survival-rebalance';
/** First APEX network release, before deterministic idle autonomy metadata. */
const LEGACY_RULES_VERSION_V22_68 = 'frontier-command-v2.68-commander-corps';
/** Commander autonomy release, before country-trait progression became canonical. */
const LEGACY_RULES_VERSION_V22_69 = 'frontier-command-v2.69-commander-autonomy';
/** Country-trait progression release, before Commander doctrine capabilities became canonical. */
const LEGACY_RULES_VERSION_V22_70 = 'frontier-command-v2.70-meta-traits';
/** Last Commander-doctrine release before run-only drafts became canonical. */
const LEGACY_RULES_VERSION_V22_71 = 'frontier-command-v2.71-commander-doctrines';
/** Run-progression release whose APEX economy used the retired oversized scale. */
const LEGACY_RULES_VERSION_V22_72 = 'frontier-command-v2.72-run-progression';
/** Private-reserve APEX finance release before all output entered the shared Empire ledger. */
const LEGACY_RULES_VERSION_V22_73 = 'frontier-command-v2.73-apex-finance';
/** Last canonical release that persisted territorial land condition. */
const LEGACY_RULES_VERSION_V22_74 = 'frontier-command-v2.74-shared-apex-economy';
/** Last canonical release before civilian Food was retired in favour of Logistics Readiness. */
const LEGACY_RULES_VERSION_V22_75 = 'frontier-command-v2.75-no-land-condition';
/** Last authenticated release where APEX persisted a synthetic elite Army. */
const LEGACY_RULES_VERSION_V22_76 = 'frontier-command-v2.76-logistics-readiness';
/** Last release before the Antarctic base garrison was redistributed toward its perimeter. */
const LEGACY_RULES_VERSION_V22_77 = 'frontier-command-v2.77-apex-shield-multipliers';
/** Last allocation-driven research release before one active national programme became canonical. */
const LEGACY_RULES_VERSION_V22_78 = 'frontier-command-v2.78-rogue-perimeter-balance';
/** Last weekly-calendar release; its canonical state already uses active research. */
const LEGACY_RULES_VERSION_V22_79 = 'frontier-command-v2.79-active-research';
/** Last single-focus, post-completion-choice research release. */
const LEGACY_RULES_VERSION_V22_80 = 'frontier-command-v2.80-daily-ticks';
/** Parallel-research release before attack throughput and DEF tempo were rebalanced. */
const LEGACY_RULES_VERSION_V22_81 = 'frontier-command-v2.81-parallel-research';
const LEGACY_CONTENT_VERSION_V16 = 'natural-earth-countries-2026-v6-naval';
const LEGACY_CONTENT_VERSION_V17 = 'natural-earth-countries-2026-v7-greenland';
const LEGACY_BOT_MANPOWER_PER_UNIT = 0.10;
const LEGACY_BOT_TECH_STRENGTH_MULTIPLIER = 1.22;

function hasCurrentCanonicalShapeV2(rulesVersion: string): boolean {
  return rulesVersion === V2_RULES_VERSION
    || rulesVersion === LEGACY_RULES_VERSION_V22_81
    || rulesVersion === LEGACY_RULES_VERSION_V22_80
    || rulesVersion === LEGACY_RULES_VERSION_V22_79
    || rulesVersion === LEGACY_RULES_VERSION_V22_78
    || rulesVersion === LEGACY_RULES_VERSION_V22_77;
}

interface LegacyBattleBotProgramV13 {
  unlocked: boolean;
  researchProgress: number;
  technologyLevel: number;
  capacityProgress: number;
  productionProgress: number;
}

interface LegacyArmyV13 {
  manpower: number;
  capacity: number;
  battleBots: number;
  battleBotCapacity: number;
  battleBotWear: number;
}

interface LegacyArmyV14 {
  manpower: number;
  capacity: number;
  veteranManpower: number;
  veteranExperience: number;
}

interface LegacyArmyV17 extends LegacyArmyV14 {
  baseAttack: number;
  baseDefense: number;
}

type LegacyNationV21 = Omit<NationStateV2, 'openingArmyBonus'>;
type LegacyNationV19 = Omit<NationStateV2, 'openingArmyBonus' | 'trainedReserves'> & { combatExperience: number };
type LegacyNationV18 = Omit<NationStateV2, 'domesticFoodCapacity' | 'openingArmyBonus' | 'trainedReserves'> & { combatExperience: number };
type LegacyNationV17 = Omit<NationStateV2, 'domesticFoodCapacity' | 'openingArmyBonus' | 'trainedReserves'>;
type LegacyNationV15 = Omit<LegacyNationV17, 'manualActionUses'>;
type LegacyNationV13 = LegacyNationV15 & { battleBots: LegacyBattleBotProgramV13 };
interface LegacyControlStateV2 {
  controller: PlayerId;
  share: number;
}
type LegacyTerritoryBaseV17 = Omit<TerritoryStateV2, 'army' | 'coreOwner' | 'integrationProgram'> & {
  condition: number;
  control?: LegacyControlStateV2;
};
type LegacyTerritoryV13 = LegacyTerritoryBaseV17 & { army: LegacyArmyV13 };
type LegacyTerritoryV14 = LegacyTerritoryBaseV17 & { army: LegacyArmyV14 };
type LegacyTerritoryV17 = LegacyTerritoryBaseV17 & { army: LegacyArmyV17 };
type LegacyIntegrationProgramV18 = Omit<IntegrationProgramStateV2, 'annualCost' | 'fromOwnerId'>;
type LegacyTerritoryV18 = Omit<TerritoryStateV2, 'integrationProgram'> & {
  condition: number;
  integrationProgram?: LegacyIntegrationProgramV18;
  control?: LegacyControlStateV2;
};

type LegacyNationV20 = Omit<NationStateV2, 'openingArmyBonus'> & {
  research: NationStateV2['research'] & {
    effectLevels: NationStateV2['research']['effectLevels'] & { control?: number };
  };
};
type LegacyResearchStateV278 = Omit<NationStateV2['research'], 'activeProgram'>;
type LegacyNationV278 = Omit<NationStateV2, 'research'> & {
  research: LegacyResearchStateV278;
};
type LegacySaveGameV22ResearchV278 = Omit<SaveGameV2, 'rulesVersion' | 'players'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_78;
  players: Record<PlayerId, LegacyNationV278>;
};
type LegacyTerritoryV20 = TerritoryStateV2 & { condition: number; control?: LegacyControlStateV2 };
type LegacyPeaceOfferV20 = Omit<PeaceOfferV2, 'settlement'> & {
  settlement: PeaceOfferV2['settlement'] | 'control';
  territoryId?: TerritoryId;
};
type LegacyWarStateV21 = Omit<WarStateV2, 'revenge'>;
interface LegacyCommanderArmyV276 {
  manpower: number;
  capacity: number;
  trainedReserves: number;
  baseAttack: number;
  baseDefense: number;
}
type LegacyCommanderForceV276 = Omit<CommanderForceStateV2,
  'shield' | 'capabilities' | 'empireSupport' | 'doctrineRuntime'> & {
  army: LegacyCommanderArmyV276;
  capabilities: Omit<CommanderForceStateV2['capabilities'], 'forceMultiplier'>;
  empireSupport: Omit<CommanderForceStateV2['empireSupport'],
    'armyCasualtyMultiplier' | 'armyPeaceRecoveryMultiplier'>;
  doctrineRuntime?: Omit<NonNullable<CommanderForceStateV2['doctrineRuntime']>,
    'emergencyRebootUsed'>;
};
type LegacyCommanderForceV268 = Omit<LegacyCommanderForceV276,
  'capabilities' | 'countryTraitScale' | 'orderSource' | 'manualHoldUntilTick'>;
type LegacyCommanderForceV269 = Omit<LegacyCommanderForceV276, 'capabilities' | 'countryTraitScale'>;
type LegacyCommanderForceV270 = Omit<LegacyCommanderForceV276, 'capabilities'>;
type LegacySaveGameV22CommanderArmyV276 = Omit<SaveGameV2, 'commanderForces'> & {
  commanderForces: Partial<Record<PlayerId, LegacyCommanderForceV276>>;
};
type LegacySaveGameV22RunV271 = Omit<LegacySaveGameV22CommanderArmyV276, 'rulesVersion' | 'runProgression'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_71;
};
type LegacySaveGameV22FinanceV272 = Omit<LegacySaveGameV22CommanderArmyV276, 'rulesVersion'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_72 | typeof LEGACY_RULES_VERSION_V22_73;
};
type LegacySaveGameV22ConditionV274 = Omit<LegacySaveGameV22CommanderArmyV276, 'rulesVersion' | 'territories'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_74;
  territories: Record<TerritoryId, TerritoryStateV2 & { condition: number }>;
};
type LegacySaveGameV22FoodV275 = Omit<LegacySaveGameV22CommanderArmyV276, 'rulesVersion'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_75;
};
type LegacySaveGameV22ApexArmyV276 = Omit<LegacySaveGameV22CommanderArmyV276, 'rulesVersion'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_76;
};
type LegacySaveGameV22CommanderV268 = Omit<SaveGameV2, 'rulesVersion' | 'commanderForces' | 'runProgression'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_68;
  commanderForces: Partial<Record<PlayerId, LegacyCommanderForceV268>>;
};
type LegacySaveGameV22CommanderV269 = Omit<SaveGameV2, 'rulesVersion' | 'commanderForces' | 'runProgression'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_69;
  commanderForces: Partial<Record<PlayerId, LegacyCommanderForceV269>>;
};
type LegacySaveGameV22CommanderV270 = Omit<SaveGameV2, 'rulesVersion' | 'commanderForces' | 'runProgression'> & {
  rulesVersion: typeof LEGACY_RULES_VERSION_V22_70;
  commanderForces: Partial<Record<PlayerId, LegacyCommanderForceV270>>;
};
type LegacySaveGameV22PreCommander = Omit<SaveGameV2, 'commanderForces' | 'runProgression'>;
type LegacySaveGameV22PrePolar = Omit<LegacySaveGameV22PreCommander, 'polarEndgame'>;
interface LegacySaveGameV21 extends Omit<SaveGameV2,
  'schemaVersion' | 'rulesVersion' | 'alliances' | 'allianceOffers'
  | 'firstIntegrationDiscountUsedBy' | 'commanderForces' | 'players' | 'polarEndgame' | 'runProgression' | 'wars'> {
  schemaVersion: 21;
  rulesVersion: typeof LEGACY_RULES_VERSION_V21;
  players: Record<PlayerId, LegacyNationV21>;
  wars: LegacyWarStateV21[];
}
interface LegacySaveGameV20 extends Omit<LegacySaveGameV21,
  'schemaVersion' | 'rulesVersion' | 'humanPlayerIds' | 'players' | 'territories' | 'offers'> {
  schemaVersion: 20;
  rulesVersion: string;
  players: Record<PlayerId, LegacyNationV20>;
  territories: Record<TerritoryId, LegacyTerritoryV20>;
  offers: LegacyPeaceOfferV20[];
}

type LegacyWarStateV16 = Omit<WarStateV2, 'attackerOperations' | 'defenderOperations'> & {
  attackerOperation?: FrontOperationV2;
  defenderOperation?: FrontOperationV2;
};

/** Read-only compatibility shape for the last Combat Experience save format. */
export interface LegacySaveGameV19 extends Omit<LegacySaveGameV21,
  'schemaVersion' | 'rulesVersion' | 'humanPlayerIds' | 'players'> {
  schemaVersion: 19;
  rulesVersion: typeof LEGACY_RULES_VERSION_V19;
  players: Record<PlayerId, LegacyNationV19>;
}

/** Read-only compatibility shape for the original long integration calendar. */
export interface LegacySaveGameV18 extends Omit<LegacySaveGameV21,
  'schemaVersion' | 'rulesVersion' | 'humanPlayerIds' | 'players' | 'territories'> {
  schemaVersion: 18;
  rulesVersion: typeof LEGACY_RULES_VERSION_V18;
  players: Record<PlayerId, LegacyNationV18>;
  territories: Record<TerritoryId, LegacyTerritoryV18>;
}

/** Read-only compatibility shape for the final veteran/multi-front format. */
export interface LegacySaveGameV17 extends Omit<LegacySaveGameV21,
  'schemaVersion' | 'rulesVersion' | 'contentVersion' | 'humanPlayerIds' | 'players' | 'territories'> {
  schemaVersion: 17;
  rulesVersion: typeof LEGACY_RULES_VERSION_V17;
  contentVersion: typeof LEGACY_CONTENT_VERSION_V17;
  players: Record<PlayerId, LegacyNationV17>;
  territories: Record<TerritoryId, LegacyTerritoryV17>;
}

/** Read-only compatibility shape for the last single-front save format. */
export interface LegacySaveGameV16 extends Omit<LegacySaveGameV17,
  'schemaVersion' | 'rulesVersion' | 'contentVersion' | 'wars'> {
  schemaVersion: 16;
  rulesVersion: typeof LEGACY_RULES_VERSION_V16;
  contentVersion: typeof LEGACY_CONTENT_VERSION_V16;
  wars: LegacyWarStateV16[];
}

/** Read-only compatibility shape for the final nation-wide ATK/DEF save format. */
export interface LegacySaveGameV14 extends Omit<LegacySaveGameV16,
  'schemaVersion' | 'rulesVersion' | 'players' | 'territories'> {
  schemaVersion: 14;
  rulesVersion: typeof LEGACY_RULES_VERSION_V14;
  players: Record<PlayerId, LegacyNationV15>;
  territories: Record<TerritoryId, LegacyTerritoryV14>;
}

export interface LegacySaveGameV15 extends Omit<LegacySaveGameV16,
  'schemaVersion' | 'rulesVersion' | 'players'> {
  schemaVersion: 15;
  rulesVersion: typeof LEGACY_RULES_VERSION_V15;
  players: Record<PlayerId, LegacyNationV15>;
}

/** Read-only compatibility shape for the final Battle Bot save format. */
export interface LegacySaveGameV13 extends Omit<LegacySaveGameV14,
  'schemaVersion' | 'rulesVersion' | 'players' | 'territories'> {
  schemaVersion: 13;
  rulesVersion: typeof LEGACY_RULES_VERSION_V13;
  players: Record<PlayerId, LegacyNationV13>;
  territories: Record<TerritoryId, LegacyTerritoryV13>;
}

interface LegacyWorldStateV17 extends Omit<WorldStateV2,
  'schemaVersion' | 'rulesVersion' | 'contentVersion' | 'humanPlayerIds'
  | 'firstIntegrationDiscountUsedBy' | 'commanderForces' | 'players' | 'territories' | 'alliances' | 'allianceOffers'
  | 'polarEndgame' | 'runProgression'> {
  schemaVersion: 17;
  rulesVersion: typeof LEGACY_RULES_VERSION_V17;
  contentVersion: typeof LEGACY_CONTENT_VERSION_V17;
  players: Record<PlayerId, LegacyNationV17>;
  territories: Record<TerritoryId, LegacyTerritoryV17>;
}

interface LegacyWorldStateV16 extends Omit<LegacyWorldStateV17,
  'schemaVersion' | 'rulesVersion' | 'contentVersion' | 'wars'> {
  schemaVersion: 16;
  rulesVersion: typeof LEGACY_RULES_VERSION_V16;
  contentVersion: typeof LEGACY_CONTENT_VERSION_V16;
  wars: LegacyWarStateV16[];
}

interface LegacyWorldStateV14 extends Omit<LegacyWorldStateV16,
  'schemaVersion' | 'rulesVersion' | 'players' | 'territories'> {
  schemaVersion: 14;
  rulesVersion: typeof LEGACY_RULES_VERSION_V14;
  players: Record<PlayerId, LegacyNationV15>;
  territories: Record<TerritoryId, LegacyTerritoryV14>;
}

interface LegacyWorldStateV15 extends Omit<LegacyWorldStateV16,
  'schemaVersion' | 'rulesVersion' | 'players'> {
  schemaVersion: 15;
  rulesVersion: typeof LEGACY_RULES_VERSION_V15;
  players: Record<PlayerId, LegacyNationV15>;
}

const SAVE_KEYS = [
  'actionSequence', 'aiEscalation', 'allianceOffers', 'alliances', 'canonicalStateHash', 'ceasefireObligations', 'commanderForces', 'contentVersion', 'firstIntegrationDiscountUsedBy', 'humanPlayerId', 'humanPlayerIds', 'mapId',
  'nextEventId', 'nextOfferId', 'nextWarId', 'offers', 'players', 'rngState', 'rulesVersion', 'schemaVersion',
  'polarEndgame', 'seed', 'territories', 'tick', 'truces', 'wars',
  'runProgression',
].sort();
const PRE_RUN_PROGRESSION_SAVE_KEYS = SAVE_KEYS.filter((key) => key !== 'runProgression');
const PRE_COMMANDER_SAVE_KEYS = PRE_RUN_PROGRESSION_SAVE_KEYS.filter((key) => key !== 'commanderForces');
const PRE_POLAR_SAVE_KEYS = PRE_COMMANDER_SAVE_KEYS.filter((key) => key !== 'polarEndgame');
const PRE_V263_SAVE_KEYS = PRE_POLAR_SAVE_KEYS.filter((key) => key !== 'firstIntegrationDiscountUsedBy');
const SCHEMA_21_SAVE_KEYS = PRE_V263_SAVE_KEYS.filter((key) => key !== 'alliances' && key !== 'allianceOffers');
const LEGACY_SAVE_KEYS = SCHEMA_21_SAVE_KEYS.filter((key) => key !== 'humanPlayerIds');
const RETIRED_CAMPAIGN_PRESSURE_SAVE_KEYS = [
  'warStrain', 'warStrainLevel', 'warStrainScore',
] as const;

const LEGACY_NATION_KEYS_V13 = [
  'battleBots', 'budget', 'capitalId', 'ceasefiresRequested', 'empireName', 'foodSecurity', 'foodStock',
  'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick', 'research',
  'researchSurgeAvailableTick', 'treasury', 'warFatigue',
].sort();
const LEGACY_NATION_KEYS_V17 = [
  'budget', 'capitalId', 'ceasefiresRequested', 'empireName', 'foodSecurity', 'foodStock',
  'manualActionUses', 'propagandaAvailableTick', 'propagandaProgram', 'rapidRecruitmentAvailableTick',
  'research', 'researchSurgeAvailableTick', 'treasury', 'warFatigue',
].sort();
const LEGACY_NATION_KEYS_V18 = [...LEGACY_NATION_KEYS_V17, 'combatExperience'].sort();
const LEGACY_NATION_KEYS_V19 = [
  ...LEGACY_NATION_KEYS_V18,
  'domesticFoodCapacity',
].sort();
const LEGACY_TERRITORY_KEYS = ['army', 'condition', 'control', 'economy', 'integration', 'owner', 'population'];
const LEGACY_ARMY_KEYS_V13 = ['battleBotCapacity', 'battleBotWear', 'battleBots', 'capacity', 'manpower'];
const LEGACY_ARMY_KEYS_V14 = ['capacity', 'manpower', 'veteranExperience', 'veteranManpower'];
const LEGACY_ARMY_KEYS_V17 = [
  'baseAttack', 'baseDefense', 'capacity', 'manpower', 'veteranExperience', 'veteranManpower',
];
const LEGACY_INTEGRATION_PROGRAM_KEYS_V18 = [
  'completesTick', 'fromCoreOwnerId', 'startedTick', 'toOwnerId',
];
const LEGACY_BOT_PROGRAM_KEYS = [
  'capacityProgress', 'productionProgress', 'researchProgress', 'technologyLevel', 'unlocked',
];

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function fnv1a(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

function sortedRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Clones the persisted per-war APEX ledger in stable player order. Present
 * malformed values remain malformed so invariant validation rejects them after
 * the original payload has been authenticated; only an absent legacy ledger
 * receives the safe empty default.
 */
function cloneApexWarTelemetryV2(
  value: unknown,
): WarStateV2['apexTelemetryByPlayer'] {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value as never;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([playerId, telemetry]) => [
      playerId,
      telemetry && typeof telemetry === 'object' && !Array.isArray(telemetry)
        ? { ...telemetry } : telemetry,
    ])) as WarStateV2['apexTelemetryByPlayer'];
}

/** Deep-clone the save-stable report inputs without repairing authenticated
 * malformed values before invariant validation. */
function cloneWarReportBaselinesV2(
  value: unknown,
): WarStateV2['reportBaselineByPlayer'] {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value as never;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([playerId, baseline]) => [
      playerId,
      baseline && typeof baseline === 'object' && !Array.isArray(baseline)
        ? {
            ...baseline,
            ...('ownedTerritoryIds' in baseline
              ? { ownedTerritoryIds: Array.isArray(baseline.ownedTerritoryIds)
                  ? [...baseline.ownedTerritoryIds] : baseline.ownedTerritoryIds }
              : {}),
            ...('touchedTerritoryIds' in baseline
              ? { touchedTerritoryIds: Array.isArray(baseline.touchedTerritoryIds)
                  ? [...baseline.touchedTerritoryIds] : baseline.touchedTerritoryIds }
              : {}),
            ...('allyContributorIds' in baseline
              ? { allyContributorIds: Array.isArray(baseline.allyContributorIds)
                  ? [...baseline.allyContributorIds] : baseline.allyContributorIds }
              : {}),
          }
        : baseline,
    ])) as WarStateV2['reportBaselineByPlayer'];
}

function payloadWithoutHash<T extends object>(save: T): Omit<T, 'canonicalStateHash'> {
  const { canonicalStateHash: _ignored, ...payload } = save as T & { canonicalStateHash?: unknown };
  return payload as Omit<T, 'canonicalStateHash'>;
}

export function canonicalStateHashV2(value: object): string {
  return fnv1a(stableStringify(payloadWithoutHash(value)));
}

function cloneResearchStateV2(research: NationStateV2['research']): NationStateV2['research'] {
  return {
    ...research,
    allocations: { ...research.allocations },
    categoryDirections: cloneResearchDirectionsV2(research.categoryDirections),
    progress: { ...research.progress },
    effectLevels: { ...research.effectLevels },
    breakthroughs: { ...research.breakthroughs },
  };
}

function migrateResearchDirectionsV2(state: WorldStateV2): void {
  for (const nation of Object.values(state.players)) {
    const legacyActive = nation.research.activeProgram;
    const directions = createDefaultResearchDirectionsV2();
    if (legacyActive) {
      const direction = defaultResearchDirectionForBranchV2(legacyActive);
      const category = direction
        ? researchCategoryForDirectionV2(direction.branch, direction.effect) : undefined;
      if (direction && category) directions[category] = direction;
    }
    nation.research.activeProgram = null;
    nation.research.categoryDirections = directions;
  }
}

export function createSaveV2(state: WorldStateV2, content: WorldContentV2): SaveGameV2 {
  assertInvariantsV2(state, content);
  const payload: Omit<SaveGameV2, 'canonicalStateHash'> = {
    schemaVersion: 22,
    rulesVersion: state.rulesVersion,
    contentVersion: state.contentVersion,
    mapId: state.mapId,
    seed: state.seed,
    rngState: state.rngState,
    tick: state.tick,
    actionSequence: state.actionSequence,
    humanPlayerId: state.humanPlayerId,
    humanPlayerIds: [...state.humanPlayerIds].sort((left, right) => left.localeCompare(right)),
    firstIntegrationDiscountUsedBy: [...state.firstIntegrationDiscountUsedBy]
      .sort((left, right) => left.localeCompare(right)),
    commanderForces: cloneCommanderForcesV2(state.commanderForces),
    players: Object.fromEntries((Object.entries(state.players) as Array<[PlayerId, NationStateV2]>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, nation]) => [id, {
        ...nation,
        ceasefiresRequested: 0,
        research: cloneResearchStateV2(nation.research),
        openingArmyBonus: nation.openingArmyBonus ? { ...nation.openingArmyBonus } : null,
      }])) as Record<PlayerId, NationStateV2>,
    territories: sortedRecord(state.territories) as Record<TerritoryId, TerritoryStateV2>,
    wars: [...state.wars]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((war) => ({
        ...war,
        // Optional compatibility inputs are serialized canonically so a
        // save/load round-trip cannot change the next state hash.
        attackerCivilianLosses: war.attackerCivilianLosses ?? 0,
        defenderCivilianLosses: war.defenderCivilianLosses ?? 0,
        attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
        defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
        apexTelemetryByPlayer: cloneApexWarTelemetryV2(war.apexTelemetryByPlayer),
        reportBaselineByPlayer: cloneWarReportBaselinesV2(war.reportBaselineByPlayer),
        revenge: war.revenge ? { ...war.revenge } : null,
        ...(war.campaign ? { campaign: { ...war.campaign } } : {}),
      })),
    truces: [...state.truces].sort((a, b) => a.leftId.localeCompare(b.leftId) || a.rightId.localeCompare(b.rightId)),
    // Retired compatibility fields remain canonical but can never persist
    // negotiations or payment obligations into a new save.
    ceasefireObligations: [],
    offers: [],
    alliances: [...state.alliances]
      .sort((left, right) => left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId))
      .map((alliance) => ({ ...alliance })),
    allianceOffers: state.allianceOffers
      .filter((offer) => offer.expiresTick > state.tick)
      .sort((left, right) => left.fromId.localeCompare(right.fromId) || left.toId.localeCompare(right.toId))
      .map((offer) => ({ ...offer })),
    aiEscalation: { ...state.aiEscalation, coalitionMembers: [...state.aiEscalation.coalitionMembers] },
    polarEndgame: clonePolarEndgameV2(state.polarEndgame),
    runProgression: cloneRunProgressionV2(state.runProgression, content),
    nextEventId: state.nextEventId,
    nextWarId: state.nextWarId,
    nextOfferId: state.nextOfferId,
  };
  return { ...payload, canonicalStateHash: canonicalStateHashV2(payload) };
}

export function serializeSaveV2(state: WorldStateV2, content: WorldContentV2): string {
  return stableStringify(createSaveV2(state, content));
}

function exactKeys(value: object, allowed: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...allowed]
    .filter((key) => key !== 'control' || key in value)
    .sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/**
 * V2.78 is authenticated before conversion, but a caller can still re-sign a
 * structurally forged payload. Require the exact historical research envelope
 * so migration never legitimizes a missing or pre-seeded active programme.
 */
function assertLegacyResearchShapeV278(save: LegacySaveGameV22ResearchV278): void {
  const legacyResearchKeys = ['allocations', 'breakthroughs', 'effectLevels', 'progress'];
  for (const [playerId, nation] of Object.entries(save.players)) {
    const research = (nation as { research?: unknown }).research;
    if (!research || typeof research !== 'object' || Array.isArray(research)
      || !exactKeys(research, legacyResearchKeys)) {
      throw new Error(`Legacy V2 nation ${playerId} has non-canonical research state.`);
    }
  }
}

/**
 * V2.74 is authenticated in its original form, then retired land condition is
 * removed. Require that exact historical scalar before conversion so a
 * re-signed malformed payload cannot masquerade as the compatibility schema.
 * Every still-live canonical field is validated by the ordinary v2.75
 * invariant pass after the scalar is stripped.
 */
function assertLegacyCanonicalShapeV274(save: LegacySaveGameV22ConditionV274): void {
  for (const [territoryId, territory] of Object.entries(save.territories)) {
    if (!territory || typeof territory !== 'object'
      || !Object.prototype.hasOwnProperty.call(territory, 'condition')
      || !Number.isFinite(territory.condition)
      || territory.condition < 0.15
      || territory.condition > 1) {
      throw new Error(`Legacy V2.74 territory ${territoryId} has invalid land condition.`);
    }
  }
}

function assertLegacyCanonicalShapeV13(save: LegacySaveGameV13): void {
  for (const [playerId, nation] of Object.entries(save.players)) {
    if (!nation || typeof nation !== 'object' || !exactKeys(nation, LEGACY_NATION_KEYS_V13)
      || !nation.battleBots || typeof nation.battleBots !== 'object'
      || !exactKeys(nation.battleBots, LEGACY_BOT_PROGRAM_KEYS)) {
      throw new Error(`Legacy V2 nation ${playerId} has non-canonical Battle Bot state.`);
    }
    const program = nation.battleBots;
    if (typeof program.unlocked !== 'boolean'
      || !Number.isInteger(program.technologyLevel) || program.technologyLevel < 0
      || ![program.researchProgress, program.capacityProgress, program.productionProgress]
        .every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error(`Legacy V2 nation ${playerId} has invalid Battle Bot state.`);
    }
  }
  for (const [territoryId, territory] of Object.entries(save.territories)) {
    if (!territory || typeof territory !== 'object' || !exactKeys(territory, LEGACY_TERRITORY_KEYS)
      || !territory.army || typeof territory.army !== 'object'
      || !exactKeys(territory.army, LEGACY_ARMY_KEYS_V13)) {
      throw new Error(`Legacy V2 territory ${territoryId} has non-canonical Battle Bot state.`);
    }
    const army = territory.army;
    if (![army.manpower, army.capacity, army.battleBots, army.battleBotCapacity, army.battleBotWear]
      .every((value) => Number.isFinite(value) && value >= 0)
      || army.manpower > army.capacity
      || !Number.isInteger(army.battleBots) || !Number.isInteger(army.battleBotCapacity)
      || army.battleBots > army.battleBotCapacity) {
      throw new Error(`Legacy V2 territory ${territoryId} has invalid Battle Bot state.`);
    }
  }
}

function assertLegacyCanonicalShapeV14(
  value: { territories: Record<TerritoryId, LegacyTerritoryV14> },
): void {
  for (const [territoryId, territory] of Object.entries(value.territories)) {
    if (!territory || typeof territory !== 'object' || !exactKeys(territory, LEGACY_TERRITORY_KEYS)
      || !territory.army || typeof territory.army !== 'object'
      || !exactKeys(territory.army, LEGACY_ARMY_KEYS_V14)) {
      throw new Error(`Legacy V2 territory ${territoryId} has non-canonical veteran army state.`);
    }
    const army = territory.army;
    if (![army.manpower, army.capacity, army.veteranManpower, army.veteranExperience]
      .every((item) => Number.isFinite(item) && item >= 0)
      || army.manpower > army.capacity
      || army.veteranManpower > army.manpower
      || (army.veteranManpower === 0 && army.veteranExperience !== 0)) {
      throw new Error(`Legacy V2 territory ${territoryId} has invalid veteran army state.`);
    }
  }
}

function assertLegacyCanonicalShapeV17(
  value: {
    players: Record<PlayerId, LegacyNationV17>;
    territories: Record<TerritoryId, LegacyTerritoryV17>;
  },
): void {
  for (const [playerId, nation] of Object.entries(value.players)) {
    if (!nation || typeof nation !== 'object' || !exactKeys(nation, LEGACY_NATION_KEYS_V17)) {
      throw new Error(`Legacy V2 nation ${playerId} has non-canonical veteran state.`);
    }
  }
  for (const [territoryId, territory] of Object.entries(value.territories)) {
    if (!territory || typeof territory !== 'object' || !exactKeys(territory, LEGACY_TERRITORY_KEYS)
      || !territory.army || typeof territory.army !== 'object'
      || !exactKeys(territory.army, LEGACY_ARMY_KEYS_V17)) {
      throw new Error(`Legacy V2 territory ${territoryId} has non-canonical veteran army state.`);
    }
    const army = territory.army;
    if (![army.manpower, army.capacity, army.baseAttack, army.baseDefense,
      army.veteranManpower, army.veteranExperience]
      .every((item) => Number.isFinite(item) && item >= 0)
      || army.baseAttack <= 0 || army.baseDefense <= 0
      || army.manpower > army.capacity
      || army.veteranManpower > army.manpower
      || (army.veteranManpower === 0 && army.veteranExperience !== 0)) {
      throw new Error(`Legacy V2 territory ${territoryId} has invalid veteran army state.`);
    }
  }
}

function roundMigrationValue(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000_000) / 1_000_000_000;
}

function roundLegacyMilitaryRatingV14(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function migrateLegacySaveV13(save: LegacySaveGameV13): LegacyWorldStateV14 {
  assertLegacyCanonicalShapeV13(save);
  const players = Object.fromEntries(Object.entries(save.players).map(([id, legacyNation]) => {
    const { battleBots: _retiredProgram, ...nation } = legacyNation;
    return [id, nation];
  })) as Record<PlayerId, LegacyNationV15>;

  const territories = Object.fromEntries(Object.entries(save.territories).map(([id, legacyTerritory]) => {
    const program = save.players[legacyTerritory.owner]?.battleBots;
    const technologyLevel = program?.technologyLevel ?? 0;
    const deployedBots = Math.max(0, legacyTerritory.army.battleBots);
    const botEquivalentManpower = deployedBots
      * LEGACY_BOT_MANPOWER_PER_UNIT
      * LEGACY_BOT_TECH_STRENGTH_MULTIPLIER ** technologyLevel;
    const veteranManpower = roundMigrationValue(Math.min(
      legacyTerritory.army.manpower,
      botEquivalentManpower,
    ));
    const territory: LegacyTerritoryV14 = {
      owner: legacyTerritory.owner,
      population: legacyTerritory.population,
      economy: legacyTerritory.economy,
      condition: legacyTerritory.condition,
      integration: legacyTerritory.integration,
      army: {
        manpower: legacyTerritory.army.manpower,
        capacity: legacyTerritory.army.capacity,
        veteranManpower,
        veteranExperience: veteranManpower > 0 ? Math.max(1, technologyLevel + 1) : 0,
      },
      ...(legacyTerritory.control ? { control: { ...legacyTerritory.control } } : {}),
    };
    return [id, territory];
  })) as Record<TerritoryId, LegacyTerritoryV14>;

  const state: LegacyWorldStateV14 = {
    schemaVersion: 14,
    rulesVersion: LEGACY_RULES_VERSION_V14,
    contentVersion: save.contentVersion,
    mapId: save.mapId,
    seed: save.seed,
    rngState: save.rngState,
    tick: save.tick,
    actionSequence: save.actionSequence,
    speed: 0,
    humanPlayerId: save.humanPlayerId,
    players,
    territories,
    wars: save.wars.map((war) => ({
      ...war,
      ...(war.attackerOperation ? { attackerOperation: { ...war.attackerOperation } } : {}),
      ...(war.defenderOperation ? { defenderOperation: { ...war.defenderOperation } } : {}),
    })),
    truces: save.truces.map((truce) => ({ ...truce })),
    ceasefireObligations: save.ceasefireObligations.map((obligation) => ({ ...obligation })),
    offers: save.offers.map((offer) => ({ ...offer })),
    events: [],
    aiEscalation: {
      ...save.aiEscalation,
      coalitionMembers: [...save.aiEscalation.coalitionMembers],
    },
    nextEventId: save.nextEventId,
    nextWarId: save.nextWarId,
    nextOfferId: save.nextOfferId,
    winnerId: undefined,
    gameOver: false,
  };

  // A schema-13 operation could legally be staffed entirely by Battle Bots.
  // Once those units are retired, clear only the now-empty operation.
  for (const war of state.wars) {
    if (war.attackerOperation
      && (state.territories[war.attackerOperation.sourceId]?.army.manpower ?? 0) <= 0) {
      delete war.attackerOperation;
    }
    if (war.defenderOperation
      && (state.territories[war.defenderOperation.sourceId]?.army.manpower ?? 0) <= 0) {
      delete war.defenderOperation;
    }
  }
  return state;
}

function legacyStateFromSaveV14(save: LegacySaveGameV14): LegacyWorldStateV14 {
  assertLegacyCanonicalShapeV14(save);
  return {
    ...payloadWithoutHash(save),
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
}

interface LegacyMilitaryBaseRatingsV14 {
  attack: number;
  defense: number;
}

/** Recreates the exact population-weighted national ATK/DEF snapshot used by schema 14. */
function legacyMilitaryBaseRatingsV14(
  state: LegacyWorldStateV14,
  content: WorldContentV2,
): Map<PlayerId, LegacyMilitaryBaseRatingsV14> {
  interface Accumulator {
    attackMass: number;
    defenseMass: number;
    weight: number;
    soleOrigin?: PlayerId;
    mixed: boolean;
  }
  const accumulators = new Map<PlayerId, Accumulator>();
  const territoryIds = (Object.keys(state.territories) as TerritoryId[])
    .sort((left, right) => left.localeCompare(right));
  for (const territoryId of territoryIds) {
    const territory = state.territories[territoryId];
    const originId = content.territories[territoryId]?.initialOwnerId;
    const origin = originId ? content.nations[originId] : undefined;
    if (!territory || !originId || !origin) continue;
    const attack = origin.militaryAttackRating ?? origin.militaryQuality ?? 1;
    const defense = origin.militaryDefenseRating ?? origin.militaryQuality ?? 1;
    const weight = Math.max(0.01, Number.isFinite(territory.population) ? territory.population : 0);
    const accumulator = accumulators.get(territory.owner) ?? {
      attackMass: 0,
      defenseMass: 0,
      weight: 0,
      soleOrigin: originId,
      mixed: false,
    };
    accumulator.attackMass += attack * weight;
    accumulator.defenseMass += defense * weight;
    accumulator.weight += weight;
    accumulator.mixed ||= accumulator.soleOrigin !== originId;
    accumulators.set(territory.owner, accumulator);
  }

  const byNation = new Map<PlayerId, LegacyMilitaryBaseRatingsV14>();
  const playerIds = (Object.keys(state.players) as PlayerId[])
    .sort((left, right) => left.localeCompare(right));
  for (const playerId of playerIds) {
    const own = content.nations[playerId];
    const fallback = {
      attack: own?.militaryAttackRating ?? own?.militaryQuality ?? 1,
      defense: own?.militaryDefenseRating ?? own?.militaryQuality ?? 1,
    };
    const accumulator = accumulators.get(playerId);
    if (!accumulator || accumulator.weight <= 0) {
      byNation.set(playerId, fallback);
      continue;
    }
    if (!accumulator.mixed && accumulator.soleOrigin) {
      const origin = content.nations[accumulator.soleOrigin];
      byNation.set(playerId, {
        attack: origin?.militaryAttackRating ?? origin?.militaryQuality ?? fallback.attack,
        defense: origin?.militaryDefenseRating ?? origin?.militaryQuality ?? fallback.defense,
      });
      continue;
    }
    byNation.set(playerId, {
      attack: roundLegacyMilitaryRatingV14(accumulator.attackMass / accumulator.weight),
      defense: roundLegacyMilitaryRatingV14(accumulator.defenseMass / accumulator.weight),
    });
  }
  return byNation;
}

function migrateLegacyStateV14(
  legacyState: LegacyWorldStateV14,
  content: WorldContentV2,
): LegacyWorldStateV15 {
  assertLegacyCanonicalShapeV14(legacyState);
  const nationalRatings = legacyMilitaryBaseRatingsV14(legacyState, content);
  const territories = Object.fromEntries(Object.entries(legacyState.territories).map(([rawId, legacyTerritory]) => {
    const territoryId = rawId as TerritoryId;
    const ownerDefinition = content.nations[legacyTerritory.owner];
    const ownerRating = nationalRatings.get(legacyTerritory.owner) ?? {
      attack: ownerDefinition?.militaryAttackRating ?? ownerDefinition?.militaryQuality ?? 1,
      defense: ownerDefinition?.militaryDefenseRating ?? ownerDefinition?.militaryQuality ?? 1,
    };
    const originId = content.territories[territoryId]?.initialOwnerId;
    const originDefinition = originId ? content.nations[originId] : undefined;
    const localRating = {
      attack: originDefinition?.militaryAttackRating ?? originDefinition?.militaryQuality ?? ownerRating.attack,
      defense: originDefinition?.militaryDefenseRating ?? originDefinition?.militaryQuality ?? ownerRating.defense,
    };
    const rating = legacyTerritory.army.manpower > 0 ? ownerRating : localRating;
    const territory: LegacyTerritoryV17 = {
      owner: legacyTerritory.owner,
      population: legacyTerritory.population,
      economy: legacyTerritory.economy,
      condition: legacyTerritory.condition,
      integration: legacyTerritory.integration,
      army: {
        manpower: legacyTerritory.army.manpower,
        capacity: legacyTerritory.army.capacity,
        baseAttack: rating.attack,
        baseDefense: rating.defense,
        veteranManpower: legacyTerritory.army.veteranManpower,
        veteranExperience: legacyTerritory.army.veteranExperience,
      },
      ...(legacyTerritory.control ? { control: { ...legacyTerritory.control } } : {}),
    };
    return [territoryId, territory];
  })) as Record<TerritoryId, LegacyTerritoryV17>;

  const state: LegacyWorldStateV15 = {
    ...legacyState,
    schemaVersion: 15,
    rulesVersion: LEGACY_RULES_VERSION_V15,
    territories,
  };
  synchronizeArmyCapacityV2(state as unknown as WorldStateV2, content);
  // Modern live capacity may be below a legacy deployed cohort. Schema 17
  // still required capacity >= manpower, so preserve those authenticated
  // soldiers as temporary legacy deployment room until migration completes.
  for (const territory of Object.values(state.territories)) {
    territory.army.capacity = Math.max(territory.army.capacity, territory.army.manpower);
    territory.army.veteranManpower = Math.min(
      territory.army.veteranManpower,
      territory.army.manpower,
    );
    if (territory.army.veteranManpower === 0) territory.army.veteranExperience = 0;
  }
  return state;
}

function legacyStateFromSaveV15(save: LegacySaveGameV15): LegacyWorldStateV15 {
  return {
    ...payloadWithoutHash(save),
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
}

function migrateLegacyStateV15(legacyState: LegacyWorldStateV15): LegacyWorldStateV16 {
  const players = Object.fromEntries(Object.entries(legacyState.players).map(([id, nation]) => [id, {
    ...nation,
    manualActionUses: { rapidRecruitment: 0, researchSurge: 0, propaganda: 0 },
  }])) as Record<PlayerId, LegacyNationV17>;
  return {
    ...legacyState,
    schemaVersion: 16,
    rulesVersion: LEGACY_RULES_VERSION_V16,
    players,
  };
}

function legacyStateFromSaveV16(save: LegacySaveGameV16): LegacyWorldStateV16 {
  return {
    ...payloadWithoutHash(save),
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
}

function cloneLegacyTerritoryV17(territory: LegacyTerritoryV17): LegacyTerritoryV17 {
  return {
    ...territory,
    army: { ...territory.army },
    ...(territory.control ? { control: { ...territory.control } } : {}),
  };
}

function legacyTerritoryFromCurrentV2(territory: TerritoryStateV2): LegacyTerritoryV17 {
  const {
    coreOwner: _coreOwner,
    integrationProgram: _integrationProgram,
    ...legacyTerritory
  } = territory;
  return {
    ...legacyTerritory,
    condition: 1,
    army: {
      ...territory.army,
      veteranManpower: 0,
      veteranExperience: 0,
    },
  };
}

function legacyNationFromCurrentV2(nation: NationStateV2): LegacyNationV17 {
  const {
    domesticFoodCapacity: _domesticFoodCapacity,
    openingArmyBonus: _openingArmyBonus,
    trainedReserves: _trainedReserves,
    ...legacy
  } = nation;
  return {
    ...legacy,
    budget: { ...legacy.budget },
    research: {
      ...legacy.research,
      allocations: { ...legacy.research.allocations },
      progress: { ...legacy.research.progress },
      effectLevels: { ...legacy.research.effectLevels },
      breakthroughs: { ...legacy.research.breakthroughs },
    },
    manualActionUses: { ...legacy.manualActionUses },
    propagandaProgram: legacy.propagandaProgram ? { ...legacy.propagandaProgram } : null,
  };
}

/**
 * Schema 17 adds genuine multi-front wars and makes Greenland independent in
 * new campaigns. Old conquests retain their already-damaged historical values
 * at full integration so loading a save never applies the new 10% gate twice.
 */
function migrateLegacyStateV16(
  legacyState: LegacyWorldStateV16,
  content: WorldContentV2,
): LegacyWorldStateV17 {
  const fresh = createWorldStateV2(legacyState.seed, content);
  const players = Object.fromEntries(Object.entries(legacyState.players).map(([id, nation]) => [id, {
    ...nation,
    budget: { ...nation.budget },
    research: {
      ...nation.research,
      allocations: { ...nation.research.allocations },
      progress: { ...nation.research.progress },
      effectLevels: { ...nation.research.effectLevels },
      breakthroughs: { ...nation.research.breakthroughs },
    },
    manualActionUses: { ...nation.manualActionUses },
    propagandaProgram: nation.propagandaProgram ? { ...nation.propagandaProgram } : null,
  }])) as Record<PlayerId, LegacyNationV17>;
  for (const playerId of content.nationIds) {
    if (!players[playerId]) players[playerId] = legacyNationFromCurrentV2(fresh.players[playerId]!);
  }

  const territories = Object.fromEntries(Object.entries(legacyState.territories).map(([id, territory]) => [id, {
    ...cloneLegacyTerritoryV17(territory),
    integration: 1,
  }])) as Record<TerritoryId, LegacyTerritoryV17>;

  const denmarkId = content.territoryIds.find((id) => String(id) === 'dnk');
  const greenlandId = content.territoryIds.find((id) => String(id) === 'grl');
  if (denmarkId && greenlandId && !territories[greenlandId]) {
    const denmark = territories[denmarkId];
    const greenlandFresh = fresh.territories[greenlandId];
    const denmarkBaseline = content.territories[denmarkId]?.baseline;
    const greenlandBaseline = content.territories[greenlandId]?.baseline;
    if (denmark && greenlandFresh && denmarkBaseline && greenlandBaseline) {
      const populationShare = greenlandBaseline.population
        / Math.max(0.000001, denmarkBaseline.population + greenlandBaseline.population);
      const economyShare = greenlandBaseline.gdp
        / Math.max(0.000001, denmarkBaseline.gdp + greenlandBaseline.gdp);
      const greenlandPopulation = roundMigrationValue(denmark.population * populationShare);
      const greenlandEconomy = roundMigrationValue(denmark.economy * economyShare);
      const greenlandManpower = roundMigrationValue(denmark.army.manpower * populationShare);
      const greenlandVeterans = roundMigrationValue(denmark.army.veteranManpower * populationShare);
      denmark.population = roundMigrationValue(denmark.population - greenlandPopulation);
      denmark.economy = roundMigrationValue(denmark.economy - greenlandEconomy);
      denmark.army.manpower = roundMigrationValue(denmark.army.manpower - greenlandManpower);
      denmark.army.veteranManpower = roundMigrationValue(denmark.army.veteranManpower - greenlandVeterans);
      territories[greenlandId] = {
        ...legacyTerritoryFromCurrentV2(greenlandFresh),
        owner: denmark.owner,
        population: greenlandPopulation,
        economy: greenlandEconomy,
        condition: denmark.condition,
        integration: 1,
        army: {
          ...greenlandFresh.army,
          manpower: greenlandManpower,
          baseAttack: greenlandManpower > 0 ? denmark.army.baseAttack : greenlandFresh.army.baseAttack,
          baseDefense: greenlandManpower > 0 ? denmark.army.baseDefense : greenlandFresh.army.baseDefense,
          veteranManpower: greenlandVeterans,
          veteranExperience: greenlandVeterans > 0 ? denmark.army.veteranExperience : 0,
        },
        ...(denmark.control ? { control: { ...denmark.control } } : {}),
      };
    }
  }
  for (const territoryId of content.territoryIds) {
    if (!territories[territoryId]) {
      territories[territoryId] = legacyTerritoryFromCurrentV2(fresh.territories[territoryId]!);
    }
  }

  const state: LegacyWorldStateV17 = {
    ...legacyState,
    schemaVersion: 17,
    rulesVersion: LEGACY_RULES_VERSION_V17,
    contentVersion: LEGACY_CONTENT_VERSION_V17,
    players,
    territories,
    wars: legacyState.wars.map((war) => {
      const { attackerOperation, defenderOperation, ...base } = war;
      return {
        ...base,
        attackerOperations: attackerOperation ? [{ ...attackerOperation }] : [],
        defenderOperations: defenderOperation ? [{ ...defenderOperation }] : [],
      };
    }),
  };
  for (const war of state.wars) {
    war.attackerOperations = war.attackerOperations.filter((operation) => (
      (state.territories[operation.sourceId]?.army.manpower ?? 0) > 0
    ));
    war.defenderOperations = war.defenderOperations.filter((operation) => (
      (state.territories[operation.sourceId]?.army.manpower ?? 0) > 0
    ));
  }
  return state;
}

function legacyStateFromSaveV17(save: LegacySaveGameV17): LegacyWorldStateV17 {
  assertLegacyCanonicalShapeV17(save);
  return {
    ...payloadWithoutHash(save),
    players: sortedRecord(save.players) as Record<PlayerId, LegacyNationV17>,
    territories: sortedRecord(save.territories) as Record<TerritoryId, LegacyTerritoryV17>,
    wars: save.wars.map((war) => ({
      ...war,
      attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
      defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
    })),
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
}

/** Retires local veteran fields while preserving canonical armies and research. */
function migrateLegacyStateV17(
  legacyState: LegacyWorldStateV17,
  content: WorldContentV2,
): WorldStateV2 {
  assertLegacyCanonicalShapeV17(legacyState);
  const players = Object.fromEntries(Object.entries(legacyState.players).map(([rawId, nation]) => (
    [rawId, {
      ...nation,
      budget: { ...nation.budget },
      research: {
        ...nation.research,
        allocations: { ...nation.research.allocations },
        progress: { ...nation.research.progress },
        effectLevels: { ...nation.research.effectLevels },
        breakthroughs: { ...nation.research.breakthroughs },
      },
      manualActionUses: { ...nation.manualActionUses },
      propagandaProgram: nation.propagandaProgram ? { ...nation.propagandaProgram } : null,
      domesticFoodCapacity: 0,
      openingArmyBonus: null,
      trainedReserves: 0,
    }]
  ))) as Record<PlayerId, NationStateV2>;

  const territories = Object.fromEntries(Object.entries(legacyState.territories).map(([rawId, territory]) => {
    const territoryId = rawId as TerritoryId;
    const originalOwnerId = content.territories[territoryId]?.initialOwnerId ?? territory.owner;
    const integratingForeignCore = originalOwnerId !== territory.owner && territory.integration < 1;
    const remainingIntegrationShare = Math.max(0, Math.min(
      1,
      (1 - territory.integration) / Math.max(0.000001, 1 - CONQUEST_INITIAL_INTEGRATION_SHARE),
    ));
    const remainingDuration = Math.max(1, Math.ceil(
      territoryIntegrationDurationWeeksV2(content, territoryId) * remainingIntegrationShare,
    ));
    const {
      veteranManpower: _veteranManpower,
      veteranExperience: _veteranExperience,
      ...army
    } = territory.army;
    const { condition: _retiredCondition, ...territoryWithoutCondition } = territory;
    return [territoryId, {
      ...territoryWithoutCondition,
      coreOwner: integratingForeignCore ? originalOwnerId : territory.owner,
      ...(integratingForeignCore ? {
        integrationProgram: {
          fromOwnerId: originalOwnerId,
          fromCoreOwnerId: originalOwnerId,
          toOwnerId: territory.owner,
          startedTick: legacyState.tick,
          completesTick: legacyState.tick + remainingDuration,
          annualCost: territoryIntegrationAnnualCostV2(territory.economy),
        },
      } : {}),
      army: { ...army },
      ...(territory.control ? { control: { ...territory.control } } : {}),
    }];
  })) as Record<TerritoryId, TerritoryStateV2>;

  const state: WorldStateV2 = {
    ...legacyState,
    schemaVersion: 22,
    rulesVersion: V2_RULES_VERSION,
    contentVersion: V2_CONTENT_VERSION,
    humanPlayerIds: [legacyState.humanPlayerId],
    firstIntegrationDiscountUsedBy: [],
    commanderForces: {},
    alliances: [],
    allianceOffers: [],
    polarEndgame: createInitialPolarEndgameV2(),
    runProgression: createInitialRunProgressionV2(content),
    players,
    territories,
    wars: legacyState.wars.map((war) => ({
      ...war,
      attackerCivilianLosses: war.attackerCivilianLosses === undefined
        ? 0 : war.attackerCivilianLosses,
      defenderCivilianLosses: war.defenderCivilianLosses === undefined
        ? 0 : war.defenderCivilianLosses,
      attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
      defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
      revenge: null,
    })),
  };
  synchronizeArmyCapacityV2(state, content);
  for (const playerId of Object.keys(state.players) as PlayerId[]) {
    state.players[playerId]!.domesticFoodCapacity = roundMigrationValue(
      selectFoodDomesticCapacityTargetV2(state, content, playerId),
    );
  }
  return state;
}

function currentStateFromSave(
  save: SaveGameV2 | LegacySaveGameV22ResearchV278 | LegacySaveGameV22ApexArmyV276 | LegacySaveGameV22FoodV275 | LegacySaveGameV22ConditionV274 | LegacySaveGameV22FinanceV272 | LegacySaveGameV22RunV271 | LegacySaveGameV22CommanderV268 | LegacySaveGameV22CommanderV269 | LegacySaveGameV22CommanderV270 | LegacySaveGameV22PreCommander | LegacySaveGameV22PrePolar | LegacySaveGameV21 | LegacySaveGameV20 | LegacySaveGameV19 | LegacySaveGameV18,
  content: WorldContentV2,
  retireLegacyCombatExperience = false,
): WorldStateV2 {
  if (retireLegacyCombatExperience) {
    const expectedNationKeys = save.schemaVersion === 19
      ? LEGACY_NATION_KEYS_V19 : LEGACY_NATION_KEYS_V18;
    for (const [playerId, nation] of Object.entries(save.players)) {
      if (!nation || typeof nation !== 'object' || !exactKeys(nation, expectedNationKeys)
        || !Number.isFinite((nation as { combatExperience?: number }).combatExperience)
        || (nation as { combatExperience: number }).combatExperience < 0) {
        throw new Error(`Legacy V2 nation ${playerId} has non-canonical Combat Experience state.`);
      }
    }
  }
  const missingDomesticCapacity = new Set<PlayerId>();
  const players = Object.fromEntries(Object.entries(save.players).map(([rawId, nation]) => {
    const playerId = rawId as PlayerId;
    const serializedCapacity = (nation as { domesticFoodCapacity?: number }).domesticFoodCapacity;
    const hasOpeningArmyBonus = Object.prototype.hasOwnProperty.call(nation, 'openingArmyBonus');
    const serializedOpeningArmyBonus = (nation as { openingArmyBonus?: unknown }).openingArmyBonus;
    const clonedOpeningArmyBonus = serializedOpeningArmyBonus
      && typeof serializedOpeningArmyBonus === 'object'
      && !Array.isArray(serializedOpeningArmyBonus)
      ? { ...serializedOpeningArmyBonus }
      : serializedOpeningArmyBonus;
    const serializedNation = nation as NationStateV2 & {
      combatExperience?: number;
      warStrain?: unknown;
      warStrainLevel?: unknown;
      warStrainScore?: unknown;
    };
    const canonicalNationWithRetiredFields: NationStateV2 = retireLegacyCombatExperience
      ? (({ combatExperience: _retiredCombatExperience, ...rest }) => ({
        ...rest,
        trainedReserves: 0,
      } as NationStateV2))(serializedNation)
      : serializedNation;
    const {
      warStrain: _retiredWarStrain,
      warStrainLevel: _retiredWarStrainLevel,
      warStrainScore: _retiredWarStrainScore,
      ...canonicalNation
    } = canonicalNationWithRetiredFields as NationStateV2 & {
      warStrain?: unknown;
      warStrainLevel?: unknown;
      warStrainScore?: unknown;
    };
    if (serializedCapacity === undefined) missingDomesticCapacity.add(playerId);
    return [playerId, {
      ...canonicalNation,
      ...(serializedCapacity === undefined ? { domesticFoodCapacity: 0 } : {}),
      budget: { ...canonicalNation.budget },
      research: {
        ...canonicalNation.research,
        allocations: { ...canonicalNation.research.allocations },
        ...(save.rulesVersion === V2_RULES_VERSION
          || save.rulesVersion === LEGACY_RULES_VERSION_V22_81
          ? { categoryDirections: cloneResearchDirectionsV2(
              canonicalNation.research.categoryDirections,
            ) }
          : {}),
        progress: { ...canonicalNation.research.progress },
        effectLevels: { ...canonicalNation.research.effectLevels },
        breakthroughs: { ...canonicalNation.research.breakthroughs },
      },
      manualActionUses: { ...canonicalNation.manualActionUses },
      propagandaProgram: canonicalNation.propagandaProgram ? { ...canonicalNation.propagandaProgram } : null,
      ...(hasOpeningArmyBonus
        ? { openingArmyBonus: clonedOpeningArmyBonus }
        : hasCurrentCanonicalShapeV2(save.rulesVersion)
          ? {}
          : { openingArmyBonus: null }),
    }];
  })) as Record<PlayerId, NationStateV2>;
  const territories = Object.fromEntries(Object.entries(save.territories).map(([rawId, territory]) => {
    const serializedTerritory = territory as TerritoryStateV2 & { condition?: unknown };
    const { condition: _retiredCondition, ...territoryWithoutCondition } = serializedTerritory;
    const canonicalTerritory = hasCurrentCanonicalShapeV2(save.rulesVersion)
      ? serializedTerritory : territoryWithoutCondition;
    const program = serializedTerritory.integrationProgram;
    const serializedAnnualCost = (program as { annualCost?: number } | undefined)?.annualCost;
    return [rawId, {
      ...canonicalTerritory,
      ...(program ? {
        integrationProgram: {
          ...program,
          // Saves created before integration had a financial cost do not have
          // this quote. Freeze one from their authenticated load-time economy.
          annualCost: serializedAnnualCost === undefined
            ? territoryIntegrationAnnualCostV2(territory.economy)
            : serializedAnnualCost,
        },
      } : {}),
      army: { ...serializedTerritory.army },
    }];
  })) as Record<TerritoryId, TerritoryStateV2>;
  const serializedDiscountLedger = (
    save as { firstIntegrationDiscountUsedBy?: unknown }
  ).firstIntegrationDiscountUsedBy;
  const hasOpeningConflictProgress = Object.prototype.hasOwnProperty.call(
    save.aiEscalation,
    'openingConflictsStarted',
  );
  const serializedOpeningConflictsStarted = (
    save.aiEscalation as { openingConflictsStarted?: unknown }
  ).openingConflictsStarted;
  const serializedCommanderForces = 'commanderForces' in save
    ? save.commanderForces : {};
  const commanderForces: WorldStateV2['commanderForces'] = 'commanderForces' in save
    ? hasCurrentCanonicalShapeV2(save.rulesVersion)
      // Current authenticated saves must survive this boundary exactly so
      // invariant validation rejects missing or malformed canonical fields.
      ? structuredClone(save.commanderForces as WorldStateV2['commanderForces'])
      // Only older rulesets are entitled to Army-to-shield normalization.
      : cloneCommanderForcesV2(save.commanderForces as Readonly<Record<string, unknown>>)
    : {};
  // The runtime normalizer correctly erases private APEX cash for current
  // saves. Authenticated v2.72/v2.73 payloads need that raw value exactly once,
  // however, so the bounded legacy migration below can merge it into the
  // Empire treasury before the current canonical state is validated.
  if (save.rulesVersion === LEGACY_RULES_VERSION_V22_72
    || save.rulesVersion === LEGACY_RULES_VERSION_V22_73) {
    const rawForces = serializedCommanderForces as Readonly<Record<string, unknown>>;
    for (const [rawPlayerId, rawForce] of Object.entries(rawForces)) {
      if (!rawForce || typeof rawForce !== 'object') continue;
      const rawEconomy = (rawForce as { economy?: unknown }).economy;
      if (!rawEconomy || typeof rawEconomy !== 'object') continue;
      const rawTreasury = (rawEconomy as { treasury?: unknown }).treasury;
      const force = commanderForces[rawPlayerId as PlayerId];
      if (force && typeof rawTreasury === 'number' && Number.isFinite(rawTreasury)) {
        force.economy.treasury = Math.max(0, rawTreasury);
      }
    }
  }
  if (save.rulesVersion === LEGACY_RULES_VERSION_V22_68
    || save.rulesVersion === LEGACY_RULES_VERSION_V22_69) {
    for (const force of Object.values(commanderForces)) {
      if (!force) continue;
      force.countryTraitScale = 1;
    }
  }
  if (save.rulesVersion === LEGACY_RULES_VERSION_V22_68
    || save.rulesVersion === LEGACY_RULES_VERSION_V22_69
    || save.rulesVersion === LEGACY_RULES_VERSION_V22_70) {
    for (const force of Object.values(commanderForces)) {
      if (!force) continue;
      force.capabilities = {
        mobileHeadquarters: false,
        fieldHospital: false,
        rapidResponse: false,
        forceMultiplier: false,
        assaultSpecialist: false,
        defenseSpecialist: false,
        emergencyExtractionCharges: 0,
      };
    }
  }
  if (save.rulesVersion === LEGACY_RULES_VERSION_V22_68) {
    for (const force of Object.values(commanderForces)) {
      if (!force) continue;
      // Retired manual assignments keep their physical mission and route, but
      // never retain a player lock that could block the autonomous optimizer.
      force.orderSource = 'autonomous';
      force.manualHoldUntilTick = 0;
      if (force.mission === 'evacuate' && !force.transit) {
        force.mission = 'standby';
      }
    }
  }
  // Authenticated releases before exclusive protocol selection could freeze
  // several capstones into one solo APEX. Preserve the most clearly active
  // protocol and clear incompatible runtime state before canonical validation.
  if (!hasCurrentCanonicalShapeV2(save.rulesVersion)) {
    for (const force of Object.values(commanderForces)) {
      if (force) normalizeApexCapstoneProtocolV2(force);
    }
  }
  const authenticatedPayload = payloadWithoutHash(save) as Record<string, unknown>;
  for (const key of RETIRED_CAMPAIGN_PRESSURE_SAVE_KEYS) delete authenticatedPayload[key];
  const state: WorldStateV2 = {
    ...authenticatedPayload as Omit<WorldStateV2, 'canonicalStateHash'>,
    schemaVersion: 22,
    rulesVersion: V2_RULES_VERSION,
    humanPlayerIds: 'humanPlayerIds' in save
      ? [...save.humanPlayerIds].sort((left, right) => left.localeCompare(right))
      : [save.humanPlayerId],
    firstIntegrationDiscountUsedBy: Array.isArray(serializedDiscountLedger)
      ? [...serializedDiscountLedger] as PlayerId[]
      : serializedDiscountLedger === undefined ? [] : serializedDiscountLedger as never,
    commanderForces,
    polarEndgame: 'polarEndgame' in save
      ? clonePolarEndgameV2(save.polarEndgame as PolarEndgameStateV2)
      : createInitialPolarEndgameV2(),
    runProgression: 'runProgression' in save
      ? cloneRunProgressionV2(save.runProgression as RunProgressionStateV2, content)
      : createInitialRunProgressionV2(content),
    players,
    territories,
    alliances: 'alliances' in save
      ? save.alliances.map((alliance) => ({ ...alliance }))
      : [],
    allianceOffers: 'allianceOffers' in save
      ? save.allianceOffers.map((offer) => ({ ...offer }))
      : [],
    aiEscalation: {
      ...save.aiEscalation,
      // Authenticated saves created just before this durable ledger was added
      // are inferred below from their save-stable blackout schedule. A present
      // malformed value is preserved so invariant validation still rejects it.
      openingConflictsStarted: hasOpeningConflictProgress
        ? serializedOpeningConflictsStarted as number
        : 0,
    },
    wars: save.wars.map((war) => ({
      ...war,
      // Same-schema saves made before cumulative civilian tracking remain
      // authenticated against their original payload, then normalize here.
      attackerCivilianLosses: war.attackerCivilianLosses === undefined
        ? 0 : war.attackerCivilianLosses,
      defenderCivilianLosses: war.defenderCivilianLosses === undefined
        ? 0 : war.defenderCivilianLosses,
      attackerOperations: war.attackerOperations.map((operation) => ({ ...operation })),
      defenderOperations: war.defenderOperations.map((operation) => ({ ...operation })),
      apexTelemetryByPlayer: cloneApexWarTelemetryV2(war.apexTelemetryByPlayer),
      reportBaselineByPlayer: cloneWarReportBaselinesV2(war.reportBaselineByPlayer),
      revenge: !('revenge' in war) || war.revenge === undefined || war.revenge === null
        ? null
        : typeof war.revenge === 'object' && !Array.isArray(war.revenge)
          ? { ...war.revenge }
          : war.revenge as never,
      ...('campaign' in war && war.campaign
        ? { campaign: { ...war.campaign } }
        : {}),
    })),
    // Legacy schema-20 land offers are filtered only after their authenticated
    // payload has been reconstructed below.
    offers: save.offers.map((offer) => ({ ...offer })) as PeaceOfferV2[],
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
  const serializedPolar = 'polarEndgame' in save
    ? save.polarEndgame as unknown as Record<string, unknown>
    : undefined;
  if (content.metadata?.scenarioId === 'standard-2026'
    && serializedPolar
    && !Object.prototype.hasOwnProperty.call(serializedPolar, 'communicationsBlackoutTick')) {
    // Authenticated pre-prologue timelines remain playable; only newly saved
    // campaigns can intentionally persist the calm pre-blackout state as null.
    state.polarEndgame.communicationsBlackoutTick = state.tick;
  }
  if (!hasOpeningConflictProgress) {
    const conflictOriginTick = state.polarEndgame.communicationsBlackoutTick;
    state.aiEscalation.openingConflictsStarted = conflictOriginTick === null
      ? 0
      : openingConflictScheduleV2(state.seed, content)
        .filter((entry) => conflictOriginTick + entry.tick <= state.tick).length;
  }
  // Authentication happened before this function. Compatible saves made before
  // slow domestic capacity existed now receive a coherent live target;
  // any present invalid value remains untouched for invariant rejection.
  for (const playerId of missingDomesticCapacity) {
    state.players[playerId]!.domesticFoodCapacity = roundMigrationValue(
      selectFoodDomesticCapacityTargetV2(state, content, playerId),
    );
  }
  if (save.rulesVersion === LEGACY_RULES_VERSION_V22_68) {
    reconcileCommanderForcesV2(state, content);
  }
  return state;
}

/**
 * The v8 map adds the real Rogue empire after an old payload has authenticated.
 * Ordinary nations and territories remain byte-for-byte the player's saved
 * state; only definitions that did not exist in v7 are copied from a fresh
 * deterministic baseline for the resolved scenario.
 */
function hydrateNewContentAfterAuthenticationV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  const missingPlayerIds = content.nationIds.filter((id) => !state.players[id]);
  const missingTerritoryIds = content.territoryIds.filter((id) => !state.territories[id]);
  const contentChanged = state.contentVersion !== contentVersionForWorldContentV2(content);
  if (missingPlayerIds.length === 0 && missingTerritoryIds.length === 0 && !contentChanged) return;

  const baseline = createWorldStateV2(state.seed, content);
  for (const playerId of missingPlayerIds) {
    const nation = baseline.players[playerId];
    if (nation) state.players[playerId] = structuredClone(nation);
  }
  for (const territoryId of missingTerritoryIds) {
    const territory = baseline.territories[territoryId];
    if (territory) state.territories[territoryId] = structuredClone(territory);
  }
  state.contentVersion = contentVersionForWorldContentV2(content);
  invalidateNationIndexV2(state);
  invalidateTerritoryIndexV2(state);

  const legacyPolar = clonePolarEndgameV2(state.polarEndgame);
  const legacySurvivalActive = legacyPolar.phase === 'warning'
    || legacyPolar.phase === 'contact'
    || legacyPolar.phase === 'counteroffensive'
    || legacyPolar.phase === 'core-exposed';
  // Return surviving abstract expedition personnel before retiring the old
  // subsystem. The migration creates no soldiers and loses no stored reserve.
  for (const expedition of legacyPolar.expeditions) {
    const nation = state.players[expedition.playerId];
    if (nation) nation.trainedReserves = 0;
  }
  if (legacyPolar.phase !== 'victory') {
    const freshPolar = createInitialPolarEndgameV2();
    freshPolar.arcticPrograms = legacyPolar.arcticPrograms;
    freshPolar.phase = legacyPolar.phase === 'arctic-research' ? 'arctic-research' : 'dormant';
    freshPolar.visualRevision = legacyPolar.visualRevision + 1;
    state.polarEndgame = freshPolar;
    if (legacySurvivalActive) {
      activateRogueAiSurvivalV2(
        state,
        content,
        legacyPolar.revealedBy,
      );
      state.polarEndgame.globalWave = Math.max(1, legacyPolar.globalWave);
    }
  }
  synchronizeArmyCapacityV2(state, content);
}

/**
 * Schema 18 used twice the V2.54 country-size calendar. An authenticated old
 * save keeps its exact visible integration share, but receives the current
 * integration-calendar remainder once. Subsequent saves keep that endpoint, so it can
 * never be shortened again by another round-trip. Schema-19 programs bypass
 * this migration and retain their already promised endpoint exactly.
 */
function migrateLegacyStateV18(
  save: LegacySaveGameV18,
  content: WorldContentV2,
): WorldStateV2 {
  const canonicalTerritories = Object.fromEntries(Object.entries(save.territories).map(([rawId, territory]) => {
    const {
      integrationProgram: program,
      condition: _retiredCondition,
      ...territoryWithoutProgram
    } = territory;
    if (program !== undefined
      && (!program || typeof program !== 'object'
        || !exactKeys(program, LEGACY_INTEGRATION_PROGRAM_KEYS_V18))) {
      throw new Error(`Legacy V2 territory ${rawId} has non-canonical integration state.`);
    }
    return [rawId, {
      ...territoryWithoutProgram,
      ...(program ? {
        integrationProgram: {
          ...program,
          // Schema 18 did not retain the displaced sovereign separately. Its
          // stored former core is the only deterministic compatibility value.
          fromOwnerId: program.fromCoreOwnerId,
          annualCost: territoryIntegrationAnnualCostV2(territory.economy),
        },
      } : {}),
      army: { ...territory.army },
      ...(territory.control ? { control: { ...territory.control } } : {}),
    }];
  })) as Record<TerritoryId, TerritoryStateV2>;
  const legacyState: WorldStateV2 = {
    ...currentStateFromSave(save, content, true),
    territories: canonicalTerritories,
  };
  migrateRetiredSystemsV2(legacyState);
  migrateResearchDirectionsV2(legacyState);
  // Army capacity is derived from the current population/research/trait rules.
  // Normalize it only after the exact legacy payload has authenticated.
  synchronizeArmyCapacityV2(legacyState, content);
  // Validate the authenticated old payload before the new calendar is allowed
  // to normalize its endpoint.
  assertInvariantsV2(legacyState, content);
  const territories = Object.fromEntries(Object.entries(legacyState.territories).map(([rawId, territory]) => {
    const territoryId = rawId as TerritoryId;
    const program = territory.integrationProgram;
    if (!program) return [territoryId, {
      ...territory,
      army: { ...territory.army },
    }];
    const remainingShare = clamp(
      (1 - territory.integration) / Math.max(0.000001, 1 - CONQUEST_INITIAL_INTEGRATION_SHARE),
      0,
      1,
    );
    const remainingDuration = Math.max(1, Math.ceil(
      territoryIntegrationDurationWeeksV2(content, territoryId) * remainingShare,
    ));
    return [territoryId, {
      ...territory,
      integrationProgram: {
        ...program,
        completesTick: legacyState.tick + remainingDuration,
      },
      army: { ...territory.army },
    }];
  })) as Record<TerritoryId, TerritoryStateV2>;
  return { ...legacyState, territories };
}

/**
 * V2.57 retires partial control and cross-border settlement state. Authenticated
 * older saves discard those transient claims, preserve every completed research
 * level, and map former control research to replacement efficiency so no paid
 * breakthrough becomes worthless. V2.55 portfolios also gain the four V2.56
 * branches at zero without changing their exact-100 allocation.
 */
function selectLegacyResearchActiveProgramV2(
  allocations: Partial<Record<ResearchBranchV2, unknown>>,
): ResearchBranchV2 {
  let selected = RESEARCH_BRANCHES[0]!;
  let highestAllocation = Number.NEGATIVE_INFINITY;
  for (const branch of RESEARCH_BRANCHES) {
    const rawAllocation = allocations[branch];
    const allocation = typeof rawAllocation === 'number' && Number.isFinite(rawAllocation)
      ? rawAllocation : Number.NEGATIVE_INFINITY;
    // Strictly greater preserves RESEARCH_BRANCHES as the stable tie-break.
    if (allocation > highestAllocation) {
      selected = branch;
      highestAllocation = allocation;
    }
  }
  return selected;
}

function migrateLegacyResearchActiveProgramsV2(state: WorldStateV2): void {
  for (const nation of Object.values(state.players)) {
    nation.research.activeProgram = selectLegacyResearchActiveProgramV2(
      nation.research.allocations,
    );
  }
}

function migrateRetiredSystemsV2(state: WorldStateV2): void {
  for (const territory of Object.values(state.territories)) {
    delete (territory as LegacyTerritoryV20).control;
  }
  state.offers = [];
  state.ceasefireObligations = [];
  for (const nation of Object.values(state.players)) {
    const legacyLevels = nation.research.effectLevels as NationStateV2['research']['effectLevels'] & {
      control?: number;
    };
    const retiredControlLevel = Number.isFinite(legacyLevels.control) ? legacyLevels.control! : 0;
    const { control: _retiredControl, ...currentLevels } = legacyLevels;
    const allocations = {
      ...DEFAULT_RESEARCH_ALLOCATIONS_V2,
      ...nation.research.allocations,
    };
    nation.research = {
      activeProgram: selectLegacyResearchActiveProgramV2(allocations),
      categoryDirections: createDefaultResearchDirectionsV2(),
      allocations,
      progress: {
        ...EMPTY_RESEARCH_PROGRESS,
        ...nation.research.progress,
      },
      effectLevels: {
        ...EMPTY_RESEARCH_EFFECT_LEVELS,
        ...currentLevels,
        'reinforcement-efficiency': Math.max(0,
          (currentLevels['reinforcement-efficiency'] ?? 0) + retiredControlLevel),
      },
      breakthroughs: {
        ...EMPTY_RESEARCH_BREAKTHROUGHS,
        ...nation.research.breakthroughs,
      },
    };
  }
}

/**
 * Survival now reserves human-facing aggression for the Rogue. Authenticated
 * older saves may contain an ordinary AI offensive against a human seat; end
 * only those wars at load while preserving human-initiated ordinary wars.
 */
function retireLegacySurvivalAiOffensivesV2(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  if (content.metadata?.scenarioId !== 'survival') return;
  const humanIds = new Set(state.humanPlayerIds);
  const retiredWarIds = new Set(state.wars.filter((war) => (
    !humanIds.has(war.attackerId)
      && war.attackerId !== ROGUE_AI_NATION_ID_V2
      && humanIds.has(war.defenderId)
  )).map((war) => war.id));
  if (retiredWarIds.size === 0) return;
  state.wars = state.wars.filter((war) => !retiredWarIds.has(war.id));
  state.offers = state.offers.filter((offer) => !retiredWarIds.has(offer.warId));
}

/**
 * The original four-project North Pole program paid ordinary national research
 * levels when each project completed. The fourteen-stage program derives its
 * deliberately much smaller effects from completed project IDs instead. An
 * authenticated pre-V2.74 save therefore needs those exact old payouts removed
 * once, or it would retain the retired bonuses and stack the new curve on top.
 *
 * Each tuple is an old project reward copied from the retired authored data.
 * Normal branch research is preserved: only the known polar contribution is
 * subtracted, and a subsequent current-version save can never run this again.
 */
const LEGACY_POLAR_RESEARCH_REWARDS_V2 = [
  ['polar-demography', 'population-growth', 1],
  ['polar-demography', 'recovery', 1],
  ['polar-demography', 'food-storage', 1],
  ['cryogenic-logistics', 'supply', 2],
  ['cryogenic-logistics', 'casualty-reduction', 1],
  ['cryogenic-logistics', 'research-efficiency', 1],
  ['strategic-mobilisation', 'force-capacity', 2],
  ['strategic-mobilisation', 'reserve-training', 2],
  ['strategic-mobilisation', 'reserve-mobilization', 2],
  ['deep-ice-signals', 'attack', 1],
  ['deep-ice-signals', 'defense', 1],
  ['deep-ice-signals', 'research-speed', 1],
] as const;

function retireLegacyPolarResearchRewardsV2(state: WorldStateV2): void {
  for (const [playerId, progress] of Object.entries(state.polarEndgame.arcticPrograms)) {
    const nation = state.players[playerId as PlayerId];
    if (!nation || !progress) continue;
    const completed = new Set(progress.completedProjects);
    for (const [projectId, effect, levels] of LEGACY_POLAR_RESEARCH_REWARDS_V2) {
      if (!completed.has(projectId)) continue;
      nation.research.effectLevels[effect] = Math.max(
        0,
        nation.research.effectLevels[effect] - levels,
      );
    }
  }
}

function legacyV7ContentMatchesResolvedScenarioV2(
  serializedContentVersion: unknown,
  content: WorldContentV2,
  seed: number,
): boolean {
  if (serializedContentVersion === LEGACY_CONTENT_VERSION_V17) {
    return content.metadata?.scenarioId === 'standard-2026';
  }
  if (typeof serializedContentVersion !== 'string'
    || content.metadata?.scenarioId !== 'random-world') return false;
  const match = /^random-world-v(\d+)@natural-earth-countries-2026-v7-greenland:seed-(\d+)$/.exec(
    serializedContentVersion,
  );
  return Boolean(match
    && Number(match[1]) === content.metadata.scenarioVersion
    && Number(match[2]) === seed
    && content.metadata.generatedFromSeed === seed);
}

/**
 * V2.76/V2.77 distributed the Rogue's opening force by Antarctic civilian
 * population, leaving almost the entire base garrison in Zero Point. Once that
 * exact save has authenticated, redistribute only its surviving non-wave cohort
 * according to the new authored military-infrastructure weights. Existing wave
 * personnel stay on their recorded territories and the operation never creates
 * manpower. A breached Antarctic empire is left untouched so migration cannot
 * undo player progress or move soldiers through a captured sector.
 */
function reconcileLegacyAntarcticBaseGarrisonV276V277(
  state: WorldStateV2,
  content: WorldContentV2,
): void {
  const sectors = ANTARCTIC_TERRITORY_IDS_V2.map((territoryId) => ({
    territoryId,
    definition: content.territories[territoryId],
    territory: state.territories[territoryId],
  }));
  if (sectors.length !== 9 || sectors.some(({ definition, territory }) => (
    !definition
      || !territory
      || territory.owner !== ROGUE_AI_NATION_ID_V2
      || !Number.isFinite(definition.armyCapacityWeight)
      || (definition.armyCapacityWeight ?? 0) <= 0
  ))) return;

  const cohorts = sectors.map(({ territoryId, definition, territory }) => {
    const manpower = territory!.army.manpower;
    const waveManpower = state.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0;
    return {
      territoryId,
      territory: territory!,
      weight: definition!.armyCapacityWeight!,
      manpower,
      waveManpower,
      baseManpower: manpower - waveManpower,
    };
  });
  if (cohorts.some(({ manpower, waveManpower, baseManpower }) => (
    !Number.isFinite(manpower)
      || !Number.isFinite(waveManpower)
      || waveManpower < 0
      || baseManpower < -0.000000001
  ))) return;

  const totalWeight = cohorts.reduce((sum, cohort) => sum + cohort.weight, 0);
  const totalManpowerBefore = round(cohorts.reduce(
    (sum, cohort) => sum + cohort.manpower,
    0,
  ), 9);
  const totalBaseManpower = round(cohorts.reduce(
    (sum, cohort) => sum + Math.max(0, cohort.baseManpower),
    0,
  ), 9);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0
    || !Number.isFinite(totalManpowerBefore)
    || !Number.isFinite(totalBaseManpower)) return;

  let allocatedBaseManpower = 0;
  for (let index = 0; index < cohorts.length; index += 1) {
    const cohort = cohorts[index]!;
    const baseManpower = index === cohorts.length - 1
      ? round(totalBaseManpower - allocatedBaseManpower, 9)
      : round(totalBaseManpower * cohort.weight / totalWeight, 9);
    allocatedBaseManpower = round(allocatedBaseManpower + baseManpower, 9);
    cohort.territory.army.manpower = round(cohort.waveManpower + baseManpower, 9);
  }

  // Keep the saved national headcount exact even when nine rounded shares leave
  // a one-billionth residual. The final (and largest) core cohort absorbs only
  // that arithmetic remainder; its wave component is never reduced or moved.
  const totalManpowerAfter = round(cohorts.reduce(
    (sum, cohort) => sum + cohort.territory.army.manpower,
    0,
  ), 9);
  const remainder = round(totalManpowerBefore - totalManpowerAfter, 9);
  if (remainder !== 0) {
    const core = cohorts[cohorts.length - 1]!;
    core.territory.army.manpower = round(core.territory.army.manpower + remainder, 9);
  }
}

export function loadSaveV2(
  input: string | SaveGameV2 | LegacySaveGameV22ResearchV278 | LegacySaveGameV22ApexArmyV276 | LegacySaveGameV22FoodV275 | LegacySaveGameV22ConditionV274 | LegacySaveGameV22FinanceV272 | LegacySaveGameV22RunV271 | LegacySaveGameV22CommanderV268 | LegacySaveGameV22CommanderV269 | LegacySaveGameV22CommanderV270 | LegacySaveGameV22PreCommander | LegacySaveGameV22PrePolar | LegacySaveGameV21 | LegacySaveGameV20 | LegacySaveGameV19 | LegacySaveGameV18 | LegacySaveGameV17 | LegacySaveGameV16 | LegacySaveGameV15 | LegacySaveGameV14 | LegacySaveGameV13,
  content: WorldContentV2,
): WorldStateV2 {
  registerTraitContentV2(content);
  const unknownSave = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  if (!unknownSave || typeof unknownSave !== 'object' || Array.isArray(unknownSave)) {
    throw new Error('V2 save is not an object.');
  }
  const parsed = unknownSave as Record<string, unknown>;
  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== 22 && schemaVersion !== 21 && schemaVersion !== 20 && schemaVersion !== 19 && schemaVersion !== 18 && schemaVersion !== 17 && schemaVersion !== 16 && schemaVersion !== 15 && schemaVersion !== 14 && schemaVersion !== 13) {
    throw new Error(`Unsupported V2 schemaVersion: ${String(schemaVersion)}. Current saves use schema 22; canonical schema 13–21 saves can be migrated.`);
  }
  const expectedRules = schemaVersion === 19 ? LEGACY_RULES_VERSION_V19
      : schemaVersion === 18 ? LEGACY_RULES_VERSION_V18
        : schemaVersion === 17 ? LEGACY_RULES_VERSION_V17
          : schemaVersion === 16 ? LEGACY_RULES_VERSION_V16
            : schemaVersion === 15 ? LEGACY_RULES_VERSION_V15
              : schemaVersion === 14 ? LEGACY_RULES_VERSION_V14
                : LEGACY_RULES_VERSION_V13;
  const supportedRules = schemaVersion === 22
    ? parsed.rulesVersion === V2_RULES_VERSION
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_81
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_80
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_79
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_78
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_77
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_76
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_75
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_74
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_73
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_72
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_71
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_70
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_69
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_68
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_67
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_66
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_POLAR
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_PRE_POLAR
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_TEMPORARY
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_RANDOM
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_PRE_RANDOM
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22
    : schemaVersion === 21
      ? parsed.rulesVersion === LEGACY_RULES_VERSION_V21
      : schemaVersion === 20
    ? parsed.rulesVersion === LEGACY_RULES_VERSION_V21
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V20_RESEARCH
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V20
    : parsed.rulesVersion === expectedRules;
  if (!supportedRules) throw new Error(`Unsupported V2 rulesVersion: ${String(parsed.rulesVersion)}.`);
  const keys = Object.keys(parsed).sort();
  const canonicalKeys = schemaVersion === 22
    ? keys.filter((key) => !RETIRED_CAMPAIGN_PRESSURE_SAVE_KEYS
      .includes(key as typeof RETIRED_CAMPAIGN_PRESSURE_SAVE_KEYS[number]))
    : keys;
  const expectedSaveKeys = schemaVersion === 22
    ? parsed.rulesVersion === V2_RULES_VERSION
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_81
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_80
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_79
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_78
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_77
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_76
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_75
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_74
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_73
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_72
      ? SAVE_KEYS
      : parsed.rulesVersion === LEGACY_RULES_VERSION_V22_71
        || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_70
        || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_69
        || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_68
        ? PRE_RUN_PROGRESSION_SAVE_KEYS
      : parsed.rulesVersion === LEGACY_RULES_VERSION_V22_67
        || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_66
        || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_POLAR
        ? PRE_COMMANDER_SAVE_KEYS
        : parsed.rulesVersion === LEGACY_RULES_VERSION_V22_PRE_POLAR
          ? PRE_POLAR_SAVE_KEYS
          : PRE_V263_SAVE_KEYS
    : schemaVersion === 21 ? SCHEMA_21_SAVE_KEYS : LEGACY_SAVE_KEYS;
  if (canonicalKeys.length !== expectedSaveKeys.length
    || canonicalKeys.some((key, index) => key !== expectedSaveKeys[index])) {
    throw new Error('V2 save has missing or extra top-level keys.');
  }
  const expectedContent = schemaVersion === 22
    ? contentVersionForWorldContentV2(content)
    : schemaVersion >= 17 ? V2_CONTENT_VERSION : LEGACY_CONTENT_VERSION_V16;
  const legacyV7Content = schemaVersion === 22 && legacyV7ContentMatchesResolvedScenarioV2(
    parsed.contentVersion,
    content,
    Number(parsed.seed),
  );
  if (parsed.contentVersion !== expectedContent && !legacyV7Content) {
    throw new Error(`Unsupported V2 contentVersion: ${String(parsed.contentVersion)}.`);
  }
  if (schemaVersion === 22 && parsed.contentVersion !== V2_CONTENT_VERSION
    && !legacyV7Content
    && parsed.rulesVersion !== V2_RULES_VERSION
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_81
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_80
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_79
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_78
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_77
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_76
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_75
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_74
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_73
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_72
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_71
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_70
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_69
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_68
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_67
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_66
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_POLAR
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_PRE_POLAR
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_TEMPORARY
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_RANDOM) {
    throw new Error('Alternative Universe saves require the current rules version.');
  }
  if (parsed.mapId !== V2_MAP_ID) throw new Error(`Unsupported V2 mapId: ${String(parsed.mapId)}.`);
  if (typeof parsed.canonicalStateHash !== 'string') throw new Error('V2 canonical hash is missing.');

  // This deliberately happens before any migration or normalization so every
  // supported save is authenticated against its exact original payload.
  const hash = canonicalStateHashV2(parsed);
  if (hash !== parsed.canonicalStateHash) {
    throw new Error(`V2 canonical hash mismatch: expected ${parsed.canonicalStateHash}, got ${hash}.`);
  }
  if (schemaVersion === 22 && parsed.rulesVersion === LEGACY_RULES_VERSION_V22_74) {
    assertLegacyCanonicalShapeV274(parsed as unknown as LegacySaveGameV22ConditionV274);
  }
  if (schemaVersion === 22 && parsed.rulesVersion === LEGACY_RULES_VERSION_V22_78) {
    assertLegacyResearchShapeV278(parsed as unknown as LegacySaveGameV22ResearchV278);
  }

  const state = schemaVersion === 22
    ? currentStateFromSave(parsed as unknown as SaveGameV2 | LegacySaveGameV22ResearchV278 | LegacySaveGameV22ApexArmyV276 | LegacySaveGameV22FoodV275 | LegacySaveGameV22ConditionV274 | LegacySaveGameV22FinanceV272 | LegacySaveGameV22RunV271 | LegacySaveGameV22CommanderV268 | LegacySaveGameV22CommanderV269 | LegacySaveGameV22CommanderV270 | LegacySaveGameV22PreCommander | LegacySaveGameV22PrePolar, content)
    : schemaVersion === 21
      ? currentStateFromSave(parsed as unknown as LegacySaveGameV21, content)
      : schemaVersion === 20
      ? currentStateFromSave(parsed as unknown as LegacySaveGameV20, content)
      : schemaVersion === 19
      ? currentStateFromSave(parsed as unknown as LegacySaveGameV19, content, true)
      : schemaVersion === 18
        ? migrateLegacyStateV18(parsed as unknown as LegacySaveGameV18, content)
        : migrateLegacyStateV17(schemaVersion === 17
          ? legacyStateFromSaveV17(parsed as unknown as LegacySaveGameV17)
          : migrateLegacyStateV16(schemaVersion === 16
            ? legacyStateFromSaveV16(parsed as unknown as LegacySaveGameV16)
            : migrateLegacyStateV15(schemaVersion === 15
              ? legacyStateFromSaveV15(parsed as unknown as LegacySaveGameV15)
              : migrateLegacyStateV14(
                schemaVersion === 14
                  ? legacyStateFromSaveV14(parsed as unknown as LegacySaveGameV14)
                  : migrateLegacySaveV13(parsed as unknown as LegacySaveGameV13),
                content,
              )), content), content);
  if (parsed.rulesVersion !== V2_RULES_VERSION
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_81
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_80
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_79) {
    migrateLegacyResearchActiveProgramsV2(state);
  }
  if (schemaVersion === 22
    && parsed.rulesVersion !== V2_RULES_VERSION
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_81
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_80
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_79
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_78
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_77
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_76
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_75
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_74) {
    retireLegacyPolarResearchRewardsV2(state);
  }
  // Only authenticated v7 worlds lack the new Antarctic content. A current
  // v8 save can legitimately omit countries absorbed during play; hydrating
  // those would resurrect defeated nations and break its canonical hash.
  if (legacyV7Content) hydrateNewContentAfterAuthenticationV2(state, content);
  if (parsed.rulesVersion !== V2_RULES_VERSION
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_81
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_80
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_79
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_78
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_77
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_76
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_75
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_74) {
    migrateRetiredSystemsV2(state);
    migrateLegacyCommanderEconomiesV2(
      state,
      parsed.rulesVersion === LEGACY_RULES_VERSION_V22_73 ? 0.10 : 1.5,
    );
    // V2.62–V2.64 persisted the temporary opening pool with a twenty-year
    // expiry. Extend only the authenticated metadata to the current thirty-
    // year horizon. Remaining physical manpower is never increased, so an old
    // save cannot mint troops while its future decay follows the new calendar.
    for (const nation of Object.values(state.players)) {
      const bonus = nation.openingArmyBonus;
      if (bonus && bonus.expiresTick - bonus.startedTick
        === LEGACY_OPENING_ARMY_BONUS_DURATION_TICKS_V2) {
        bonus.expiresTick = bonus.startedTick + OPENING_ARMY_BONUS_DURATION_TICKS_V2;
      }
    }
    // V2.66 persisted the former three-year campaign window. Extend only that
    // exact authenticated span; custom or already-current windows stay intact.
    for (const war of state.wars) {
      const campaign = war.campaign;
      if (campaign
        && campaign.expiresTick - war.startedTick === LEGACY_WAR_CAMPAIGN_MAX_TICKS_V2) {
        campaign.expiresTick = war.startedTick + WAR_CAMPAIGN_MAX_TICKS;
      }
    }
    // Supported older rule sets predate the current trait-capacity curve.
    // Capacity is derived, so preserving an obsolete stored value would make
    // an otherwise authentic save fail current invariants (notably Greenland).
    synchronizeArmyCapacityV2(state, content);
    if (schemaVersion === 22 && state.tick === 0
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_73
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_72
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_70
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_69
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_68
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_67
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_TEMPORARY
      && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_POLAR) {
      if (parsed.rulesVersion === LEGACY_RULES_VERSION_V22_RANDOM) {
        trackExistingOpeningArmyHumanRosterV2(state, content);
      } else if (parsed.contentVersion === V2_CONTENT_VERSION) {
        synchronizeOpeningArmyHumanRosterV2(state, content, [], state.humanPlayerIds);
      }
    }
  }
  // Run this after every older migration because retired-system hydration can
  // rebuild the legacy research object. The final current state has exactly
  // five category directions and never retains the former global focus.
  if (parsed.rulesVersion !== V2_RULES_VERSION
    && parsed.rulesVersion !== LEGACY_RULES_VERSION_V22_81) {
    migrateResearchDirectionsV2(state);
  }
  // Normalize authenticated legacy/current saves at the load boundary. This
  // never mutates the caller's live state or changes the authenticated input.
  state.offers = [];
  state.ceasefireObligations = [];
  for (const nation of Object.values(state.players)) nation.ceasefiresRequested = 0;
  normalizeRetiredFoodCompatibilityV2(state);
  normalizeRetiredReserveCompatibilityV2(state);
  synchronizeRunProgressionRosterV2(state);
  enforceSurvivalScorchedWorldV2(state, content);
  if (schemaVersion === 22
    && (parsed.rulesVersion === LEGACY_RULES_VERSION_V22_77
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V22_76)) {
    reconcileLegacyAntarcticBaseGarrisonV276V277(state, content);
  }
  synchronizeArmyCapacityV2(state, content);
  reconcileSurvivalRogueFocusWarsV2(state, content);
  retireDormantAbsorbedNationsV2(state, content);
  reconcileCommanderForcesV2(state, content);
  normalizeMandatoryApexAnalysisV2(state);
  retireLegacySurvivalAiOffensivesV2(state, content);
  // Older authenticated saves could persist a front for every border and a
  // second list for the counterattack. One opponent pair is now one canonical
  // live front; normalization happens only after the original hash is proven.
  for (const war of state.wars) {
    if (war.apexTelemetryByPlayer === undefined) war.apexTelemetryByPlayer = {};
    if (war.reportBaselineByPlayer === undefined) war.reportBaselineByPlayer = {};
    canonicalizeWarFrontV2(state, content, war);
  }
  if (schemaVersion < 22) pruneAllianceStateV2(state);
  // winnerId/gameOver are transient and intentionally omitted from saves. In
  // multiplayer, move the legacy/global focus to another living human seat;
  // the absorbed local seat remains known to the room as a spectator.
  if (!state.players[state.humanPlayerId]) {
    const livingHumanId = state.humanPlayerIds.find((playerId) => Boolean(state.players[playerId]));
    if (livingHumanId) {
      state.humanPlayerId = livingHumanId;
      state.aiEscalation.lastHumanTerritoryCount = Object.values(state.territories)
        .filter((territory) => territory.owner === livingHumanId).length;
      state.aiEscalation.lastHumanPower = 0;
    } else {
      const successorId = absorbedNationSuccessorV2(state, content, state.humanPlayerId);
      if (successorId && state.players[successorId]) {
        state.winnerId = successorId;
        state.gameOver = true;
        state.speed = 0;
      }
    }
  }
  assertInvariantsV2(state, content);
  if (state.polarEndgame.phase === 'victory') {
    state.winnerId = selectPolarVictoryWinnerV2(state);
    state.gameOver = true;
    state.speed = 0;
    return state;
  }
  const humanDefeatWinner = state.gameOver
    ? undefined : selectHumanEmpireDefeatWinnerV2(state);
  if (humanDefeatWinner) {
    state.winnerId = humanDefeatWinner;
    state.gameOver = true;
    state.speed = 0;
    return state;
  }
  const owners = [...new Set(Object.values(state.territories).map((territory) => territory.owner))];
  if (owners.length === 1
    && !state.humanPlayerIds.includes(owners[0]!)
    && Object.keys(state.territories).length === content.territoryIds.length) {
    state.winnerId = owners[0];
    state.gameOver = true;
  }
  return state;
}
