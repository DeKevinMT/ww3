import {
  CONQUEST_INITIAL_INTEGRATION_SHARE,
  EMPTY_RESEARCH_BREAKTHROUGHS,
  EMPTY_RESEARCH_EFFECT_LEVELS,
  EMPTY_RESEARCH_PROGRESS,
  DEFAULT_RESEARCH_ALLOCATIONS_V2,
  V2_CONTENT_VERSION,
  V2_MAP_ID,
  V2_RULES_VERSION,
  clamp,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { pruneAllianceStateV2 } from './alliances';
import { synchronizeArmyCapacityV2 } from './capacity';
import type { WorldContentV2 } from './content';
import {
  absorbedNationSuccessorV2,
  retireDormantAbsorbedNationsV2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { assertInvariantsV2 } from './invariants';
import { selectFoodDomesticCapacityTargetV2 } from './selectors';
import type {
  AiEscalationStateV2,
  AllianceOfferV2,
  AllianceV2,
  CeasefireObligationV2,
  FrontOperationV2,
  IntegrationProgramStateV2,
  NationStateV2,
  PeaceOfferV2,
  PlayerId,
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
  players: Record<PlayerId, NationStateV2>;
  territories: Record<TerritoryId, TerritoryStateV2>;
  wars: WarStateV2[];
  truces: TruceStateV2[];
  ceasefireObligations: CeasefireObligationV2[];
  offers: PeaceOfferV2[];
  alliances: AllianceV2[];
  allianceOffers: AllianceOfferV2[];
  aiEscalation: AiEscalationStateV2;
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
const LEGACY_CONTENT_VERSION_V16 = 'natural-earth-countries-2026-v6-naval';
const LEGACY_CONTENT_VERSION_V17 = 'natural-earth-countries-2026-v7-greenland';
const LEGACY_BOT_MANPOWER_PER_UNIT = 0.10;
const LEGACY_BOT_TECH_STRENGTH_MULTIPLIER = 1.22;

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

type LegacyNationV19 = Omit<NationStateV2, 'trainedReserves'> & { combatExperience: number };
type LegacyNationV18 = Omit<NationStateV2, 'domesticFoodCapacity' | 'trainedReserves'> & { combatExperience: number };
type LegacyNationV17 = Omit<NationStateV2, 'domesticFoodCapacity' | 'trainedReserves'>;
type LegacyNationV15 = Omit<LegacyNationV17, 'manualActionUses'>;
type LegacyNationV13 = LegacyNationV15 & { battleBots: LegacyBattleBotProgramV13 };
interface LegacyControlStateV2 {
  controller: PlayerId;
  share: number;
}
type LegacyTerritoryBaseV17 = Omit<TerritoryStateV2, 'army' | 'coreOwner' | 'integrationProgram'> & {
  control?: LegacyControlStateV2;
};
type LegacyTerritoryV13 = LegacyTerritoryBaseV17 & { army: LegacyArmyV13 };
type LegacyTerritoryV14 = LegacyTerritoryBaseV17 & { army: LegacyArmyV14 };
type LegacyTerritoryV17 = LegacyTerritoryBaseV17 & { army: LegacyArmyV17 };
type LegacyIntegrationProgramV18 = Omit<IntegrationProgramStateV2, 'annualCost' | 'fromOwnerId'>;
type LegacyTerritoryV18 = Omit<TerritoryStateV2, 'integrationProgram'> & {
  integrationProgram?: LegacyIntegrationProgramV18;
  control?: LegacyControlStateV2;
};

type LegacyNationV20 = NationStateV2 & {
  research: NationStateV2['research'] & {
    effectLevels: NationStateV2['research']['effectLevels'] & { control?: number };
  };
};
type LegacyTerritoryV20 = TerritoryStateV2 & { control?: LegacyControlStateV2 };
type LegacyPeaceOfferV20 = Omit<PeaceOfferV2, 'settlement'> & {
  settlement: PeaceOfferV2['settlement'] | 'control';
  territoryId?: TerritoryId;
};
type LegacyWarStateV21 = Omit<WarStateV2, 'revenge'>;
interface LegacySaveGameV21 extends Omit<SaveGameV2,
  'schemaVersion' | 'rulesVersion' | 'alliances' | 'allianceOffers' | 'wars'> {
  schemaVersion: 21;
  rulesVersion: typeof LEGACY_RULES_VERSION_V21;
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
  'schemaVersion' | 'rulesVersion' | 'contentVersion' | 'humanPlayerIds' | 'players' | 'territories' | 'alliances' | 'allianceOffers'> {
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
  'actionSequence', 'aiEscalation', 'allianceOffers', 'alliances', 'canonicalStateHash', 'ceasefireObligations', 'contentVersion', 'humanPlayerId', 'humanPlayerIds', 'mapId',
  'nextEventId', 'nextOfferId', 'nextWarId', 'offers', 'players', 'rngState', 'rulesVersion', 'schemaVersion',
  'seed', 'territories', 'tick', 'truces', 'wars',
].sort();
const SCHEMA_21_SAVE_KEYS = SAVE_KEYS.filter((key) => key !== 'alliances' && key !== 'allianceOffers');
const LEGACY_SAVE_KEYS = SCHEMA_21_SAVE_KEYS.filter((key) => key !== 'humanPlayerIds');

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

function payloadWithoutHash<T extends object>(save: T): Omit<T, 'canonicalStateHash'> {
  const { canonicalStateHash: _ignored, ...payload } = save as T & { canonicalStateHash?: unknown };
  return payload as Omit<T, 'canonicalStateHash'>;
}

export function canonicalStateHashV2(value: object): string {
  return fnv1a(stableStringify(payloadWithoutHash(value)));
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
    players: sortedRecord(state.players) as Record<PlayerId, NationStateV2>,
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
        revenge: war.revenge ? { ...war.revenge } : null,
      })),
    truces: [...state.truces].sort((a, b) => a.leftId.localeCompare(b.leftId) || a.rightId.localeCompare(b.rightId)),
    ceasefireObligations: [...state.ceasefireObligations]
      .sort((a, b) => a.payerId.localeCompare(b.payerId) || a.expiresTick - b.expiresTick || a.warId.localeCompare(b.warId)),
    offers: state.offers.filter((offer) => offer.status === 'pending').sort((a, b) => a.id.localeCompare(b.id)),
    alliances: [...state.alliances]
      .sort((left, right) => left.leftId.localeCompare(right.leftId) || left.rightId.localeCompare(right.rightId))
      .map((alliance) => ({ ...alliance })),
    allianceOffers: state.allianceOffers
      .filter((offer) => offer.expiresTick > state.tick)
      .sort((left, right) => left.fromId.localeCompare(right.fromId) || left.toId.localeCompare(right.toId))
      .map((offer) => ({ ...offer })),
    aiEscalation: { ...state.aiEscalation, coalitionMembers: [...state.aiEscalation.coalitionMembers] },
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
    return [territoryId, {
      ...territory,
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
    alliances: [],
    allianceOffers: [],
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
  save: SaveGameV2 | LegacySaveGameV21 | LegacySaveGameV20 | LegacySaveGameV19 | LegacySaveGameV18,
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
    const serializedNation = nation as NationStateV2 & { combatExperience?: number };
    const canonicalNation: NationStateV2 = retireLegacyCombatExperience
      ? (({ combatExperience: _retiredCombatExperience, ...rest }) => ({
        ...rest,
        trainedReserves: 0,
      } as NationStateV2))(serializedNation)
      : serializedNation;
    if (serializedCapacity === undefined) missingDomesticCapacity.add(playerId);
    return [playerId, {
      ...canonicalNation,
      ...(serializedCapacity === undefined ? { domesticFoodCapacity: 0 } : {}),
      budget: { ...canonicalNation.budget },
      research: {
        ...canonicalNation.research,
        allocations: { ...canonicalNation.research.allocations },
        progress: { ...canonicalNation.research.progress },
        effectLevels: { ...canonicalNation.research.effectLevels },
        breakthroughs: { ...canonicalNation.research.breakthroughs },
      },
      manualActionUses: { ...canonicalNation.manualActionUses },
      propagandaProgram: canonicalNation.propagandaProgram ? { ...canonicalNation.propagandaProgram } : null,
    }];
  })) as Record<PlayerId, NationStateV2>;
  const territories = Object.fromEntries(Object.entries(save.territories).map(([rawId, territory]) => {
    const serializedTerritory = territory as TerritoryStateV2;
    const program = serializedTerritory.integrationProgram;
    const serializedAnnualCost = (program as { annualCost?: number } | undefined)?.annualCost;
    return [rawId, {
      ...serializedTerritory,
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
  const state: WorldStateV2 = {
    ...payloadWithoutHash(save),
    schemaVersion: 22,
    rulesVersion: V2_RULES_VERSION,
    humanPlayerIds: 'humanPlayerIds' in save
      ? [...save.humanPlayerIds].sort((left, right) => left.localeCompare(right))
      : [save.humanPlayerId],
    players,
    territories,
    alliances: 'alliances' in save
      ? save.alliances.map((alliance) => ({ ...alliance }))
      : [],
    allianceOffers: 'allianceOffers' in save
      ? save.allianceOffers.map((offer) => ({ ...offer }))
      : [],
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
      revenge: !('revenge' in war) || war.revenge === undefined || war.revenge === null
        ? null
        : typeof war.revenge === 'object' && !Array.isArray(war.revenge)
          ? { ...war.revenge }
          : war.revenge as never,
    })),
    // Legacy schema-20 land offers are filtered only after their authenticated
    // payload has been reconstructed below.
    offers: save.offers.map((offer) => ({ ...offer })) as PeaceOfferV2[],
    speed: 0,
    events: [],
    winnerId: undefined,
    gameOver: false,
  };
  // Authentication happened before this function. Compatible saves made before
  // slow domestic capacity existed now receive a coherent live target;
  // any present invalid value remains untouched for invariant rejection.
  for (const playerId of missingDomesticCapacity) {
    state.players[playerId]!.domesticFoodCapacity = roundMigrationValue(
      selectFoodDomesticCapacityTargetV2(state, content, playerId),
    );
  }
  return state;
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
    const { integrationProgram: program, ...territoryWithoutProgram } = territory;
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
function migrateRetiredSystemsV2(state: WorldStateV2): void {
  for (const territory of Object.values(state.territories)) {
    delete (territory as LegacyTerritoryV20).control;
  }
  state.offers = state.offers
    .filter((offer) => (offer as LegacyPeaceOfferV20).settlement !== 'control')
    .map((offer) => {
      const { territoryId: _retiredTerritoryId, ...canonicalOffer } = offer as LegacyPeaceOfferV20;
      return canonicalOffer as PeaceOfferV2;
    });
  for (const nation of Object.values(state.players)) {
    const legacyLevels = nation.research.effectLevels as NationStateV2['research']['effectLevels'] & {
      control?: number;
    };
    const retiredControlLevel = Number.isFinite(legacyLevels.control) ? legacyLevels.control! : 0;
    const { control: _retiredControl, ...currentLevels } = legacyLevels;
    nation.research = {
      allocations: {
        ...DEFAULT_RESEARCH_ALLOCATIONS_V2,
        ...nation.research.allocations,
      },
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

export function loadSaveV2(
  input: string | SaveGameV2 | LegacySaveGameV21 | LegacySaveGameV20 | LegacySaveGameV19 | LegacySaveGameV18 | LegacySaveGameV17 | LegacySaveGameV16 | LegacySaveGameV15 | LegacySaveGameV14 | LegacySaveGameV13,
  content: WorldContentV2,
): WorldStateV2 {
  const unknownSave = typeof input === 'string' ? JSON.parse(input) as unknown : input;
  if (!unknownSave || typeof unknownSave !== 'object' || Array.isArray(unknownSave)) {
    throw new Error('V2 save is not an object.');
  }
  const parsed = unknownSave as Record<string, unknown>;
  const schemaVersion = parsed.schemaVersion;
  if (schemaVersion !== 22 && schemaVersion !== 21 && schemaVersion !== 20 && schemaVersion !== 19 && schemaVersion !== 18 && schemaVersion !== 17 && schemaVersion !== 16 && schemaVersion !== 15 && schemaVersion !== 14 && schemaVersion !== 13) {
    throw new Error(`Unsupported V2 schemaVersion: ${String(schemaVersion)}. Current saves use schema 22; canonical schema 13–21 saves can be migrated.`);
  }
  const keys = Object.keys(parsed).sort();
  const expectedSaveKeys = schemaVersion === 22
    ? SAVE_KEYS
    : schemaVersion === 21 ? SCHEMA_21_SAVE_KEYS : LEGACY_SAVE_KEYS;
  if (keys.length !== expectedSaveKeys.length || keys.some((key, index) => key !== expectedSaveKeys[index])) {
    throw new Error('V2 save has missing or extra top-level keys.');
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
    : schemaVersion === 21
      ? parsed.rulesVersion === LEGACY_RULES_VERSION_V21
      : schemaVersion === 20
    ? parsed.rulesVersion === LEGACY_RULES_VERSION_V21
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V20_RESEARCH
      || parsed.rulesVersion === LEGACY_RULES_VERSION_V20
    : parsed.rulesVersion === expectedRules;
  if (!supportedRules) throw new Error(`Unsupported V2 rulesVersion: ${String(parsed.rulesVersion)}.`);
  const expectedContent = schemaVersion >= 17 ? V2_CONTENT_VERSION : LEGACY_CONTENT_VERSION_V16;
  if (parsed.contentVersion !== expectedContent) throw new Error(`Unsupported V2 contentVersion: ${String(parsed.contentVersion)}.`);
  if (parsed.mapId !== V2_MAP_ID) throw new Error(`Unsupported V2 mapId: ${String(parsed.mapId)}.`);
  if (typeof parsed.canonicalStateHash !== 'string') throw new Error('V2 canonical hash is missing.');

  // This deliberately happens before any migration or normalization so every
  // supported save is authenticated against its exact original payload.
  const hash = canonicalStateHashV2(parsed);
  if (hash !== parsed.canonicalStateHash) {
    throw new Error(`V2 canonical hash mismatch: expected ${parsed.canonicalStateHash}, got ${hash}.`);
  }

  const state = schemaVersion === 22
    ? currentStateFromSave(parsed as unknown as SaveGameV2, content)
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
  if (parsed.rulesVersion !== V2_RULES_VERSION) migrateRetiredSystemsV2(state);
  // Normalize authenticated legacy/current saves at the load boundary. This
  // never mutates the caller's live state or changes the authenticated input.
  retireDormantAbsorbedNationsV2(state, content);
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
  const owners = [...new Set(Object.values(state.territories).map((territory) => territory.owner))];
  if (owners.length === 1 && Object.keys(state.territories).length === content.territoryIds.length) {
    state.winnerId = owners[0];
    state.gameOver = true;
  }
  return state;
}
