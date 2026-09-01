import type { SaveGameV2 } from '../sim/v2/persistence';
import { RESEARCH_BRANCHES } from '../sim/v2/balance';
import { researchCategoryForDirectionV2 } from '../sim/v2/researchDirections';
import { normalizeScenarioConfigV2, type ScenarioConfigV2 } from '../sim/v2/scenarios';
import { APEX_TRANSMISSION_IDS_V2 } from '../sim/v2/types';
import type {
  CommanderForceInitializationV2,
  PlayerId,
  ResearchBranchV2,
  ResearchCategoryV2,
  ResearchEffectV2,
  WorldCommandV2,
  WorldSpeedV2,
} from '../sim/v2/types';
import type { CountryMasteryRuntimeModifiersV2 } from '../sim/v2/countryMasteryRuntime';
import { APEX_EMPIRE_ANNUAL_FOOD_OUTPUT_CAP_V2 } from '../sim/v2/commanderForce';
import type { EmpireFlagIdentityV1 } from '../meta/commanderProfile';

export const MULTIPLAYER_PROTOCOL_VERSION = 8 as const;
export const MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION = 1 as const;
export const MIN_MULTIPLAYER_PLAYERS = 2;
export const MAX_MULTIPLAYER_PLAYERS = 8;
export const MAX_PROTOCOL_MESSAGE_BYTES = 4 * 1024 * 1024;
export const MAX_SIGNAL_CODE_BYTES = 512 * 1024;
export const MAX_DATA_CHANNEL_FRAME_BYTES = 64 * 1024;

const SIGNAL_CODE_PREFIX = 'FCMP1';
const WIRE_FRAME_PREFIX = 'FCW1|';
const WIRE_CHUNK_CODE_UNITS = 12 * 1024;
const MAX_WIRE_FRAGMENTS = 512;
const MAX_PENDING_WIRE_MESSAGES = 16;
const WIRE_MESSAGE_TTL_MS = 30_000;
const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 40;
const MAX_REASON_LENGTH = 300;

const RESEARCH_BRANCH_SET = new Set<string>(RESEARCH_BRANCHES);
const ARCTIC_PROJECT_SET = new Set([
  'polar-demography', 'baseline-calibration', 'polar-relay-mesh', 'anomaly-filtering',
  'neural-signature-map', 'command-verification', 'recovery-routing', 'cryogenic-logistics',
  'rogue-ballistics', 'predictive-defense', 'strategic-mobilisation', 'polar-supply-model',
  'ice-theatre-simulation', 'deep-ice-signals',
]);
const ANTARCTIC_SECTOR_SET = new Set([
  'drake-entry', 'maud-entry', 'ross-entry', 'weddell-forge', 'queen-maud-grid',
  'ross-array', 'sentinel-labyrinth', 'transantarctic-vault', 'zero-point-core',
]);
const APEX_TRANSMISSION_ID_SET = new Set<string>(APEX_TRANSMISSION_IDS_V2);

export type ProtocolErrorCode =
  | 'invalid-message'
  | 'message-too-large'
  | 'invalid-signal'
  | 'incompatible-protocol'
  | 'incompatible-rules'
  | 'invalid-wire-frame';

export class MultiplayerProtocolError extends Error {
  readonly code: ProtocolErrorCode;

  constructor(code: ProtocolErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MultiplayerProtocolError';
    this.code = code;
  }
}

export interface LobbyPlayer {
  peerId: string;
  displayName: string;
  countryId: PlayerId | null;
  /** Account effects frozen when this seat claims its country. */
  deployment: MultiplayerDeploymentSnapshotV1 | null;
  ready: boolean;
  connected: boolean;
}

/**
 * Compact account boundary shared before week zero. It carries resolved
 * numbers only: no credits, unlock roster, XP ledger or editable profile.
 */
export interface MultiplayerDeploymentSnapshotV1 {
  schemaVersion: typeof MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION;
  countryId: PlayerId;
  /** Account identity projected by this seat; independent of its starting nation. */
  empireFlag: EmpireFlagIdentityV1;
  countryMastery: CountryMasteryRuntimeModifiersV2 & {
    /** Retired compatibility field; mastery-level growth now lives in Army Capacity. */
    openingArmyMultiplier: number;
  };
  /** Kept explicit for the lobby/reconnect audit; effects are resolved in apex. */
  activeDoctrine: 'vanguard' | 'bastion' | 'rapid-response' | 'force-multiplier' | null;
  apex: CommanderForceInitializationV2;
}

export type LobbyAction =
  | { type: 'set-name'; displayName: string }
  | { type: 'set-scenario'; scenario: ScenarioConfigV2 }
  | {
      type: 'select-country';
      countryId: PlayerId;
      /** Filled by the local lobby before it is accepted or sent on wire. */
      deployment?: MultiplayerDeploymentSnapshotV1;
    }
  | { type: 'clear-country' }
  | { type: 'set-ready'; ready: boolean }
  | { type: 'start' };

export interface SequencedWorldCommand {
  sequence: number;
  senderPeerId: string;
  command: WorldCommandV2;
}

export interface HelloMessage {
  type: 'hello';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  peerId: string;
  displayName: string;
  role: 'guest';
  /** Present only when reclaiming a previously authenticated campaign seat. */
  sessionId?: string;
  rejoinToken?: string;
}

export interface HelloAckMessage {
  type: 'hello-ack';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  hostPeerId: string;
  acceptedPeerId: string;
  maxPlayers: number;
  /** Stable campaign identity; kept locally by the accepted guest. */
  sessionId?: string;
  rejoinToken?: string;
  rejoined?: boolean;
}

export interface RejectMessage {
  type: 'reject';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  code: string;
  message: string;
}

export interface LobbyStateMessage {
  type: 'lobby-state';
  revision: number;
  hostPeerId: string;
  scenario: ScenarioConfigV2;
  started: boolean;
  players: LobbyPlayer[];
}

export interface LobbyActionMessage {
  type: 'lobby-action';
  revision: number;
  action: LobbyAction;
}

/** A client request. The host validates ownership and assigns the global sequence. */
export interface CommandMessage {
  type: 'command';
  requestId: string;
  clientSequence: number;
  baseTick: number;
  command: WorldCommandV2;
}

/** Host acknowledgement for a client request, including deterministic rejection feedback. */
export interface CommandResultMessage {
  type: 'command-result';
  requestId: string;
  accepted: boolean;
  reason?: string;
  assignedSequence?: number;
}

/** One authoritative simulation boundary, broadcast by the host in exact order. */
export interface TickMessage {
  type: 'tick';
  tick: number;
  /** Periodic checkpoint only; omitted on hot-path ticks between hash intervals. */
  hash?: string;
  commands: SequencedWorldCommand[];
}

export interface SpeedMessage {
  type: 'speed';
  speed: WorldSpeedV2;
  effectiveTick: number;
}

export interface SnapshotMessage {
  type: 'snapshot';
  reason: 'join' | 'resync' | 'reconnect';
  tick: number;
  hash: string;
  /** Per-seat transport ordering cursor; independent from the global action sequence. */
  nextClientSequence: number;
  save: SaveGameV2;
}

export interface ResyncRequestMessage {
  type: 'resync-request';
  expectedTick: number;
  actualTick: number;
  expectedHash?: string;
  actualHash?: string;
  reason: string;
}

export type SessionMessage =
  | LobbyStateMessage
  | LobbyActionMessage
  | CommandMessage
  | CommandResultMessage
  | TickMessage
  | SpeedMessage
  | SnapshotMessage
  | ResyncRequestMessage;

export type MultiplayerProtocolMessage =
  | HelloMessage
  | HelloAckMessage
  | RejectMessage
  | SessionMessage;

export interface DirectInviteSignal {
  kind: 'direct-invite';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  hostPeerId: string;
  hostName: string;
  description: RTCSessionDescriptionInit & { type: 'offer'; sdp: string };
}

export interface DirectAnswerSignal {
  kind: 'direct-answer';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  rulesVersion: string;
  roomId: string;
  invitationId: string;
  guestPeerId: string;
  guestName: string;
  description: RTCSessionDescriptionInit & { type: 'answer'; sdp: string };
}

export type DirectSignal = DirectInviteSignal | DirectAnswerSignal;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new MultiplayerProtocolError('invalid-message', message);
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  return value;
}

function requireString(value: unknown, label: string, maxLength = MAX_ID_LENGTH, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) || value.length > maxLength) {
    fail(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${maxLength} characters.`);
  }
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be a finite number.`);
  return value;
}

function requireInteger(value: unknown, label: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const number = requireFiniteNumber(value, label);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    fail(`${label} must be an integer from ${min} through ${max}.`);
  }
  return number;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be a boolean.`);
  return value;
}

function requireExactKeys(
  value: UnknownRecord,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort((left, right) => left.localeCompare(right, 'en'));
  const canonical = [...expected].sort((left, right) => left.localeCompare(right, 'en'));
  if (actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])) {
    fail(`${label} must contain exactly ${canonical.join(', ')}.`);
  }
}

function requireBoundedNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const number = requireFiniteNumber(value, label);
  if (number < minimum || number > maximum) {
    fail(`${label} must be from ${minimum} through ${maximum}.`);
  }
  return number;
}

/** Strictly canonicalizes the only account data allowed into a lobby. */
export function validateMultiplayerDeploymentSnapshotV1(
  value: unknown,
  label = 'deployment',
): MultiplayerDeploymentSnapshotV1 {
  const deployment = requireRecord(value, label);
  const hasEmpireFlag = Object.prototype.hasOwnProperty.call(deployment, 'empireFlag');
  requireExactKeys(deployment, [
    'schemaVersion', 'countryId', 'countryMastery', 'activeDoctrine', 'apex',
    ...(hasEmpireFlag ? ['empireFlag'] : []),
  ], label);
  if (deployment.schemaVersion !== MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION) {
    fail(`${label}.schemaVersion must be ${MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION}.`);
  }

  const masteryLabel = `${label}.countryMastery`;
  const mastery = requireRecord(deployment.countryMastery, masteryLabel);
  requireExactKeys(mastery, [
    'openingArmyMultiplier',
    'armyCapacityMultiplier', 'attackMultiplier', 'defenseMultiplier',
    'recruitmentMultiplier', 'reserveTrainingMultiplier',
    'landSupplyMultiplier', 'landTransferThroughputMultiplier',
    'navalSupplyMultiplier', 'navalTransferThroughputMultiplier',
    'navalTransferCostMultiplier', 'recruitmentCostMultiplier',
    'standingOperatingCostMultiplier', 'casualtyMultiplier',
  ], masteryLabel);
  const growth = (key: keyof CountryMasteryRuntimeModifiersV2 | 'openingArmyMultiplier') => (
    requireBoundedNumber(mastery[key], `${masteryLabel}.${key}`, 1, 100)
  );
  const reduction = (
    key: 'navalTransferCostMultiplier' | 'recruitmentCostMultiplier'
      | 'standingOperatingCostMultiplier' | 'casualtyMultiplier',
  ) => requireBoundedNumber(mastery[key], `${masteryLabel}.${key}`, 0.01, 1);

  const apexLabel = `${label}.apex`;
  const apex = requireRecord(deployment.apex, apexLabel);
  const canonicalShieldLoadout = Object.prototype.hasOwnProperty.call(apex, 'shield');
  const transitionalShieldLoadout = !canonicalShieldLoadout && (
    Object.prototype.hasOwnProperty.call(apex, 'rechargeMultiplier')
    || Object.hasOwn(apex, 'armyCasualtyMultiplier')
    || Object.hasOwn(apex, 'armyPeaceRecoveryMultiplier')
  );
  const shieldNativeLoadout = canonicalShieldLoadout || transitionalShieldLoadout;
  const apexKeys = canonicalShieldLoadout ? [
    'shield', 'attackMultiplier', 'defenseMultiplier',
    'armyCasualtyMultiplier', 'armyPeaceRecoveryMultiplier',
    'treasury', 'annualOutput', 'supplyStock', 'countryTraitScale',
    'capabilities', 'empireSupport',
  ] : [
    'manpower', 'capacity', 'trainedReserves', 'baseAttack', 'baseDefense',
    'treasury', 'annualOutput', 'supplyStock', 'countryTraitScale',
    'capabilities', 'empireSupport',
    ...(transitionalShieldLoadout ? [
      'attackMultiplier', 'defenseMultiplier', 'rechargeMultiplier',
      'armyCasualtyMultiplier', 'armyPeaceRecoveryMultiplier',
    ] : []),
  ];
  requireExactKeys(apex, apexKeys, apexLabel);
  const shieldLabel = `${apexLabel}.shield`;
  const shield = canonicalShieldLoadout ? requireRecord(apex.shield, shieldLabel) : undefined;
  const hasShieldTalentTuning = Boolean(shield
    && Object.prototype.hasOwnProperty.call(shield, 'interceptEfficiency'));
  if (shield) {
    requireExactKeys(shield, [
      'integrity', 'maxIntegrity', 'rechargeBuffer', 'rechargeMultiplier', 'pulseAttack',
      ...(hasShieldTalentTuning ? [
        'pulseProjectionRetention', 'pulseChargeBonusPerStep',
        'interceptEfficiency', 'impactRecoveryShare', 'defensivePulseMultiplier',
      ] : []),
    ], shieldLabel);
  }
  const capabilitiesLabel = `${apexLabel}.capabilities`;
  const capabilities = requireRecord(apex.capabilities, capabilitiesLabel);
  requireExactKeys(capabilities, [
    'mobileHeadquarters', 'fieldHospital', 'rapidResponse',
    'assaultSpecialist', 'defenseSpecialist', 'emergencyExtractionCharges',
    ...(shieldNativeLoadout ? ['forceMultiplier'] : []),
  ], capabilitiesLabel);
  const supportLabel = `${apexLabel}.empireSupport`;
  const support = requireRecord(apex.empireSupport, supportLabel);
  requireExactKeys(support, [
    'recruitmentMultiplier', 'reserveTrainingMultiplier', 'annualFoodOutput',
    'foodProductionMultiplier', 'foodStorageMultiplier', 'foodImportCostMultiplier',
    ...(shieldNativeLoadout ? ['armyCasualtyMultiplier', 'armyPeaceRecoveryMultiplier'] : []),
  ], supportLabel);

  const countryId = requirePlayerId(deployment.countryId, `${label}.countryId`);
  let empireFlag: EmpireFlagIdentityV1 = { kind: 'country', countryId };
  if (hasEmpireFlag) {
    const flagLabel = `${label}.empireFlag`;
    const flag = requireRecord(deployment.empireFlag, flagLabel);
    requireExactKeys(flag, ['kind', 'countryId'], flagLabel);
    if (flag.kind !== 'country') fail(`${flagLabel}.kind is invalid.`);
    empireFlag = {
      kind: 'country',
      countryId: requirePlayerId(flag.countryId, `${flagLabel}.countryId`),
    };
  }
  const activeDoctrine = deployment.activeDoctrine === null
    || deployment.activeDoctrine === 'vanguard'
    || deployment.activeDoctrine === 'bastion'
    || deployment.activeDoctrine === 'rapid-response'
    || deployment.activeDoctrine === 'force-multiplier'
    ? deployment.activeDoctrine : fail(`${label}.activeDoctrine is invalid.`);
  const integrity = requireBoundedNumber(
    shield?.integrity ?? apex.manpower,
    canonicalShieldLoadout ? `${shieldLabel}.integrity` : `${apexLabel}.manpower`,
    0,
    10_000,
  );
  const maxIntegrity = requireBoundedNumber(
    shield?.maxIntegrity ?? apex.capacity,
    canonicalShieldLoadout ? `${shieldLabel}.maxIntegrity` : `${apexLabel}.capacity`,
    0.000001,
    10_000,
  );
  const rechargeBuffer = requireBoundedNumber(
    shield?.rechargeBuffer ?? apex.trainedReserves,
    canonicalShieldLoadout ? `${shieldLabel}.rechargeBuffer` : `${apexLabel}.trainedReserves`,
    0,
    10_000,
  );
  if (integrity > maxIntegrity || rechargeBuffer > maxIntegrity) {
    fail(`${apexLabel} Energy and Backup Energy must fit inside Max Energy.`);
  }
  const assaultSpecialist = requireBoolean(
    capabilities.assaultSpecialist,
    `${capabilitiesLabel}.assaultSpecialist`,
  );
  const defenseSpecialist = requireBoolean(
    capabilities.defenseSpecialist,
    `${capabilitiesLabel}.defenseSpecialist`,
  );
  const rapidResponse = requireBoolean(
    capabilities.rapidResponse,
    `${capabilitiesLabel}.rapidResponse`,
  );
  const forceMultiplier = shieldNativeLoadout
    ? requireBoolean(capabilities.forceMultiplier, `${capabilitiesLabel}.forceMultiplier`)
    : false;
  const emergencyReboot = requireBoolean(
    capabilities.fieldHospital,
    `${capabilitiesLabel}.fieldHospital`,
  );
  const doctrineMismatch = shieldNativeLoadout
    ? assaultSpecialist !== (activeDoctrine === 'vanguard')
      || defenseSpecialist !== (activeDoctrine === 'bastion')
      || emergencyReboot !== (activeDoctrine === 'rapid-response')
      || forceMultiplier !== (activeDoctrine === 'force-multiplier')
      || rapidResponse
    : assaultSpecialist !== (activeDoctrine === 'vanguard')
      || defenseSpecialist !== (activeDoctrine === 'bastion')
      || rapidResponse !== (activeDoctrine === 'rapid-response');
  if (doctrineMismatch) {
    fail(`${label}.activeDoctrine must match its one resolved EONSCAR specialist capability.`);
  }
  return {
    schemaVersion: MULTIPLAYER_DEPLOYMENT_SCHEMA_VERSION,
    countryId,
    empireFlag,
    activeDoctrine,
    countryMastery: {
      openingArmyMultiplier: growth('openingArmyMultiplier'),
      armyCapacityMultiplier: growth('armyCapacityMultiplier'),
      attackMultiplier: growth('attackMultiplier'),
      defenseMultiplier: growth('defenseMultiplier'),
      recruitmentMultiplier: growth('recruitmentMultiplier'),
      reserveTrainingMultiplier: growth('reserveTrainingMultiplier'),
      landSupplyMultiplier: growth('landSupplyMultiplier'),
      landTransferThroughputMultiplier: growth('landTransferThroughputMultiplier'),
      navalSupplyMultiplier: growth('navalSupplyMultiplier'),
      navalTransferThroughputMultiplier: growth('navalTransferThroughputMultiplier'),
      navalTransferCostMultiplier: reduction('navalTransferCostMultiplier'),
      recruitmentCostMultiplier: reduction('recruitmentCostMultiplier'),
      standingOperatingCostMultiplier: reduction('standingOperatingCostMultiplier'),
      casualtyMultiplier: reduction('casualtyMultiplier'),
    },
    apex: {
      shield: {
        integrity,
        maxIntegrity,
        rechargeBuffer,
        pulseAttack: canonicalShieldLoadout
          ? requireBoundedNumber(shield!.pulseAttack, `${shieldLabel}.pulseAttack`, 0, 1)
          : 0.001,
        rechargeMultiplier: canonicalShieldLoadout
          ? requireBoundedNumber(shield!.rechargeMultiplier, `${shieldLabel}.rechargeMultiplier`, 1, 3.5)
          : transitionalShieldLoadout
            ? requireBoundedNumber(apex.rechargeMultiplier, `${apexLabel}.rechargeMultiplier`, 1, 3.5)
            : 1,
        pulseProjectionRetention: hasShieldTalentTuning
          ? requireBoundedNumber(shield!.pulseProjectionRetention, `${shieldLabel}.pulseProjectionRetention`, 0, 0.35)
          : 0,
        pulseChargeBonusPerStep: hasShieldTalentTuning
          ? requireBoundedNumber(shield!.pulseChargeBonusPerStep, `${shieldLabel}.pulseChargeBonusPerStep`, 0, 0.45)
          : 0,
        interceptEfficiency: hasShieldTalentTuning
          ? requireBoundedNumber(shield!.interceptEfficiency, `${shieldLabel}.interceptEfficiency`, 1, 1.45)
          : 1,
        impactRecoveryShare: hasShieldTalentTuning
          ? requireBoundedNumber(shield!.impactRecoveryShare, `${shieldLabel}.impactRecoveryShare`, 0, 0.35)
          : 0,
        defensivePulseMultiplier: hasShieldTalentTuning
          ? requireBoundedNumber(shield!.defensivePulseMultiplier, `${shieldLabel}.defensivePulseMultiplier`, 1, 1.75)
          : 1,
      },
      attackMultiplier: shieldNativeLoadout
        ? requireBoundedNumber(apex.attackMultiplier, `${apexLabel}.attackMultiplier`, 1, 2.5)
        : 1.08,
      defenseMultiplier: shieldNativeLoadout
        ? requireBoundedNumber(apex.defenseMultiplier, `${apexLabel}.defenseMultiplier`, 1, 2.5)
        : 1.08,
      armyCasualtyMultiplier: shieldNativeLoadout
        ? requireBoundedNumber(apex.armyCasualtyMultiplier, `${apexLabel}.armyCasualtyMultiplier`, 0.82, 1)
        : 1,
      armyPeaceRecoveryMultiplier: shieldNativeLoadout
        ? requireBoundedNumber(apex.armyPeaceRecoveryMultiplier, `${apexLabel}.armyPeaceRecoveryMultiplier`, 1, 1.75)
        : 1,
      treasury: requireBoundedNumber(apex.treasury, `${apexLabel}.treasury`, 0, 1_000_000_000),
      annualOutput: requireBoundedNumber(apex.annualOutput, `${apexLabel}.annualOutput`, 0, 1_000_000_000),
      supplyStock: requireBoundedNumber(apex.supplyStock, `${apexLabel}.supplyStock`, 0, 1_000_000_000),
      countryTraitScale: requireBoundedNumber(apex.countryTraitScale, `${apexLabel}.countryTraitScale`, 0, 1),
      capabilities: {
        mobileHeadquarters: requireBoolean(capabilities.mobileHeadquarters, `${capabilitiesLabel}.mobileHeadquarters`),
        fieldHospital: emergencyReboot,
        rapidResponse: false,
        forceMultiplier,
        assaultSpecialist,
        defenseSpecialist,
        emergencyExtractionCharges: requireInteger(
          capabilities.emergencyExtractionCharges,
          `${capabilitiesLabel}.emergencyExtractionCharges`,
          0,
          2,
        ),
      },
      empireSupport: {
        recruitmentMultiplier: requireBoundedNumber(support.recruitmentMultiplier, `${supportLabel}.recruitmentMultiplier`, 1, 1.50),
        reserveTrainingMultiplier: requireBoundedNumber(support.reserveTrainingMultiplier, `${supportLabel}.reserveTrainingMultiplier`, 1, 1.75),
        armyCasualtyMultiplier: shieldNativeLoadout
          ? requireBoundedNumber(support.armyCasualtyMultiplier, `${supportLabel}.armyCasualtyMultiplier`, 0.82, 1)
          : 1,
        armyPeaceRecoveryMultiplier: shieldNativeLoadout
          ? requireBoundedNumber(support.armyPeaceRecoveryMultiplier, `${supportLabel}.armyPeaceRecoveryMultiplier`, 1, 1.75)
          : 1,
        annualFoodOutput: requireBoundedNumber(support.annualFoodOutput, `${supportLabel}.annualFoodOutput`, 0, APEX_EMPIRE_ANNUAL_FOOD_OUTPUT_CAP_V2),
        foodProductionMultiplier: requireBoundedNumber(support.foodProductionMultiplier, `${supportLabel}.foodProductionMultiplier`, 1, 1.50),
        foodStorageMultiplier: requireBoundedNumber(support.foodStorageMultiplier, `${supportLabel}.foodStorageMultiplier`, 1, 1.75),
        foodImportCostMultiplier: requireBoundedNumber(support.foodImportCostMultiplier, `${supportLabel}.foodImportCostMultiplier`, 0.75, 1),
      },
    },
  };
}

function requireScenarioConfig(value: unknown, label: string): ScenarioConfigV2 {
  const scenario = requireRecord(value, label);
  const expectedKeys = ['mode', 'seed', 'version'];
  const keys = Object.keys(scenario).sort((left, right) => left.localeCompare(right, 'en'));
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    fail(`${label} must contain exactly mode, seed and version.`);
  }
  if (scenario.mode !== 'standard-2026'
    && scenario.mode !== 'random-world'
    && scenario.mode !== 'survival') {
    fail(`${label}.mode is not supported.`);
  }
  const version = requireInteger(scenario.version, `${label}.version`, 1, 1_000);
  const seed = requireInteger(scenario.seed, `${label}.seed`, 1, 0xffff_ffff);
  try {
    const normalized = normalizeScenarioConfigV2({ mode: scenario.mode, version, seed });
    if (normalized.seed !== seed) fail(`${label}.seed is not canonical.`);
    return normalized;
  } catch (error) {
    fail(error instanceof Error ? `${label} is invalid: ${error.message}` : `${label} is invalid.`);
  }
}

function requireHash(value: unknown, label: string): string {
  return requireString(value, label, 128);
}

function requirePlayerId(value: unknown, label: string): PlayerId {
  return requireString(value, label, MAX_ID_LENGTH) as PlayerId;
}

function requireProtocolVersion(value: unknown): typeof MULTIPLAYER_PROTOCOL_VERSION {
  if (value !== MULTIPLAYER_PROTOCOL_VERSION) {
    throw new MultiplayerProtocolError(
      'incompatible-protocol',
      `Multiplayer protocol ${String(value)} is not supported; expected ${MULTIPLAYER_PROTOCOL_VERSION}.`,
    );
  }
  return MULTIPLAYER_PROTOCOL_VERSION;
}

function validateBudget(value: unknown, label: string): void {
  const budget = requireRecord(value, label);
  for (const domain of ['military', 'research', 'development'] as const) {
    const amount = requireFiniteNumber(budget[domain], `${label}.${domain}`);
    if (amount < 0 || amount > 100) fail(`${label}.${domain} must be from 0 through 100.`);
  }
}

function validateResearchAllocations(value: unknown): void {
  const allocations = requireRecord(value, 'command.allocations');
  const keys = Object.keys(allocations);
  if (keys.length !== RESEARCH_BRANCHES.length || keys.some((key) => !RESEARCH_BRANCH_SET.has(key))) {
    fail('command.allocations must contain every supported research branch exactly once.');
  }
  const values = RESEARCH_BRANCHES.map((branch) => requireInteger(
    allocations[branch], `command.allocations.${branch}`, 0, 100,
  ));
  if (values.reduce((sum, allocation) => sum + allocation, 0) !== 100) {
    fail('command.allocations must total exactly 100.');
  }
}

function validateWorldCommand(value: unknown): WorldCommandV2 {
  const command = requireRecord(value, 'command');
  const type = requireString(command.type, 'command.type', 64);

  switch (type) {
    case 'choose-country':
      requirePlayerId(command.countryId, 'command.countryId');
      break;
    case 'form-survival-empire': {
      requirePlayerId(command.flagshipId, 'command.flagshipId');
      if (!Array.isArray(command.memberIds)
        || command.memberIds.length < 1 || command.memberIds.length > 256) {
        fail('command.memberIds must be an array of 1 through 256 country IDs.');
      }
      const memberIds = command.memberIds.map((memberId, index) => (
        requirePlayerId(memberId, `command.memberIds[${index}]`)
      ));
      if (new Set(memberIds).size !== memberIds.length) {
        fail('command.memberIds must not contain duplicate country IDs.');
      }
      break;
    }
    case 'set-speed':
      if (command.speed !== 0 && command.speed !== 1 && command.speed !== 2
        && command.speed !== 3) fail('command.speed must be from 0 through 3.');
      break;
    case 'set-commander-priorities': {
      const commandKeys = Object.keys(command).sort();
      const expectedCommandKeys = ['playerId', 'priorities', 'type'];
      if (commandKeys.length !== expectedCommandKeys.length
        || commandKeys.some((key, index) => key !== expectedCommandKeys[index])) {
        fail('Commander priority commands must contain exactly playerId, priorities and type.');
      }
      requirePlayerId(command.playerId, 'command.playerId');
      const priorities = requireRecord(command.priorities, 'command.priorities');
      const keys = Object.keys(priorities).sort();
      const expected = ['development', 'logistics', 'training'];
      if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
        fail('command.priorities must contain exactly development, logistics and training.');
      }
      const values = expected.map((key) => requireInteger(
        priorities[key], `command.priorities.${key}`, 0, 100,
      ));
      if (values.reduce((sum, value) => sum + value, 0) !== 100) {
        fail('command.priorities must total exactly 100.');
      }
      break;
    }
    case 'issue-commander-order': {
      const commandKeys = Object.keys(command).sort();
      const expectedCommandKeys = ['destinationId', 'front', 'mission', 'playerId', 'type'];
      if (commandKeys.length !== expectedCommandKeys.length
        || commandKeys.some((key, index) => key !== expectedCommandKeys[index])) {
        fail('Commander orders must contain exactly destinationId, front, mission, playerId and type.');
      }
      requirePlayerId(command.playerId, 'command.playerId');
      requireString(command.destinationId, 'command.destinationId');
      if (!['standby', 'assault-support', 'defense', 'logistics-relief', 'evacuate', 'hq-training']
        .includes(String(command.mission))) fail('command.mission is invalid.');
      if (command.front !== null) {
        const front = requireRecord(command.front, 'command.front');
        const keys = Object.keys(front).sort();
        const expected = ['sourceId', 'targetId', 'warId'];
        if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
          fail('command.front must contain exactly sourceId, targetId and warId.');
        }
        requireString(front.warId, 'command.front.warId');
        requireString(front.sourceId, 'command.front.sourceId');
        requireString(front.targetId, 'command.front.targetId');
      }
      break;
    }
    case 'set-research-allocations':
      requireExactKeys(command, ['allocations', 'playerId', 'type'], 'Research allocation commands');
      requirePlayerId(command.playerId, 'command.playerId');
      validateResearchAllocations(command.allocations);
      break;
    case 'set-research-focus': {
      requireExactKeys(command, ['branch', 'playerId', 'type'], 'Research focus commands');
      requirePlayerId(command.playerId, 'command.playerId');
      if (command.branch !== null
        && (typeof command.branch !== 'string' || !RESEARCH_BRANCH_SET.has(command.branch))) {
        fail('command.branch is invalid.');
      }
      break;
    }
    case 'set-research-direction': {
      requireExactKeys(
        command,
        ['branch', 'category', 'effect', 'playerId', 'type'],
        'Research direction commands',
      );
      requirePlayerId(command.playerId, 'command.playerId');
      const category = requireString(command.category, 'command.category', 32) as ResearchCategoryV2;
      const branch = requireString(command.branch, 'command.branch', 64) as ResearchBranchV2;
      const effect = requireString(command.effect, 'command.effect', 64) as ResearchEffectV2;
      if (!RESEARCH_BRANCH_SET.has(branch)
        || researchCategoryForDirectionV2(branch, effect) !== category) {
        fail('command research direction is invalid for command.category.');
      }
      break;
    }
    case 'choose-research-breakthrough': {
      fail('Post-completion research breakthrough commands are retired; set a research direction instead.');
    }
    case 'adjust-budget':
      requirePlayerId(command.playerId, 'command.playerId');
      if (command.domain !== 'military' && command.domain !== 'research' && command.domain !== 'development') {
        fail('command.domain is invalid.');
      }
      if (Math.abs(requireFiniteNumber(command.delta, 'command.delta')) > 100) fail('command.delta is out of range.');
      break;
    case 'set-budget-policy':
      requirePlayerId(command.playerId, 'command.playerId');
      validateBudget(command.budget, 'command.budget');
      break;
    case 'rapid-recruitment':
    case 'launch-propaganda':
    case 'acknowledge-polar-warning':
      requirePlayerId(command.playerId, 'command.playerId');
      break;
    case 'choose-run-upgrade': {
      fail('Timeline adaptation card commands are retired.');
    }
    case 'respond-apex-transmission': {
      const expectedKeys = ['choice', 'playerId', 'transmissionId', 'type'];
      const keys = Object.keys(command).sort((left, right) => left.localeCompare(right, 'en'));
      if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
        fail('EONSCAR transmission responses must contain exactly playerId, transmissionId and choice.');
      }
      requirePlayerId(command.playerId, 'command.playerId');
      if (typeof command.transmissionId !== 'string'
        || !APEX_TRANSMISSION_ID_SET.has(command.transmissionId)) {
        fail('command.transmissionId is invalid.');
      }
      if (command.choice !== 'accept' && command.choice !== 'acknowledge'
        && command.choice !== 'later') {
        fail('command.choice must be accept or acknowledge.');
      }
      if (command.transmissionId === 'campaign-signal-anomaly' && command.choice !== 'accept') {
        fail('campaign-signal-anomaly is mandatory and only accepts accept.');
      }
      if (command.transmissionId !== 'campaign-signal-anomaly'
        && command.choice !== 'acknowledge') {
        fail('informational EONSCAR transmissions only accept acknowledge.');
      }
      break;
    }
    case 'start-arctic-project':
      requirePlayerId(command.playerId, 'command.playerId');
      if (typeof command.projectId !== 'string' || !ARCTIC_PROJECT_SET.has(command.projectId)) {
        fail('command.projectId is invalid.');
      }
      break;
    case 'deploy-antarctic-expedition':
      requirePlayerId(command.playerId, 'command.playerId');
      if (typeof command.sectorId !== 'string' || !ANTARCTIC_SECTOR_SET.has(command.sectorId)) {
        fail('command.sectorId is invalid.');
      }
      {
        const manpower = requireFiniteNumber(command.manpower, 'command.manpower');
        if (manpower <= 0) {
          fail('command.manpower is out of range.');
        }
      }
      break;
    case 'research-surge':
      requireExactKeys(command, ['playerId', 'targetBranch', 'type'], 'Research surge commands');
      requirePlayerId(command.playerId, 'command.playerId');
      if (typeof command.targetBranch !== 'string' || !RESEARCH_BRANCH_SET.has(command.targetBranch)) {
        fail('command.targetBranch is invalid.');
      }
      break;
    case 'set-empire-name':
      requirePlayerId(command.playerId, 'command.playerId');
      requireString(command.name, 'command.name', 80);
      break;
    case 'select-survival-counteroffensive': {
      const expectedKeys = ['playerId', 'targetId', 'type'];
      const keys = Object.keys(command).sort((left, right) => left.localeCompare(right, 'en'));
      if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
        fail('Survival counteroffensives must contain exactly playerId and targetId.');
      }
      requirePlayerId(command.playerId, 'command.playerId');
      requireString(command.targetId, 'command.targetId', MAX_ID_LENGTH);
      break;
    }
    case 'declare-war':
      requirePlayerId(command.attackerId, 'command.attackerId');
      requirePlayerId(command.defenderId, 'command.defenderId');
      if (command.escalatedFromWarId !== undefined) {
        requireString(command.escalatedFromWarId, 'command.escalatedFromWarId');
      }
      break;
    case 'propose-alliance':
      requirePlayerId(command.fromId, 'command.fromId');
      requirePlayerId(command.targetId, 'command.targetId');
      break;
    case 'respond-to-alliance':
      requirePlayerId(command.fromId, 'command.fromId');
      requirePlayerId(command.toId, 'command.toId');
      requireBoolean(command.accept, 'command.accept');
      break;
    default:
      fail(`Unknown command type: ${type}.`);
  }

  return command as unknown as WorldCommandV2;
}

function validateLobbyPlayer(value: unknown, index: number): LobbyPlayer {
  const player = requireRecord(value, `players[${index}]`);
  const countryId = player.countryId === null
    ? null : requirePlayerId(player.countryId, `players[${index}].countryId`);
  const deployment = player.deployment === null
    || (player.deployment === undefined && countryId === null)
    ? null : validateMultiplayerDeploymentSnapshotV1(
      player.deployment,
      `players[${index}].deployment`,
    );
  if ((countryId === null) !== (deployment === null)) {
    fail(`players[${index}].countryId and deployment must be selected together.`);
  }
  if (countryId !== null && deployment?.countryId !== countryId) {
    fail(`players[${index}].deployment.countryId must match countryId.`);
  }
  return {
    peerId: requireString(player.peerId, `players[${index}].peerId`),
    displayName: requireString(player.displayName, `players[${index}].displayName`, MAX_NAME_LENGTH),
    countryId,
    deployment,
    ready: requireBoolean(player.ready, `players[${index}].ready`),
    connected: requireBoolean(player.connected, `players[${index}].connected`),
  };
}

function validateLobbyAction(value: unknown): LobbyAction {
  const action = requireRecord(value, 'action');
  const type = requireString(action.type, 'action.type', 32);
  switch (type) {
    case 'set-name':
      return { type, displayName: requireString(action.displayName, 'action.displayName', MAX_NAME_LENGTH) };
    case 'set-scenario':
      return { type, scenario: requireScenarioConfig(action.scenario, 'action.scenario') };
    case 'select-country': {
      const countryId = requirePlayerId(action.countryId, 'action.countryId');
      const deployment = validateMultiplayerDeploymentSnapshotV1(action.deployment, 'action.deployment');
      if (deployment.countryId !== countryId) {
        fail('action.deployment.countryId must match action.countryId.');
      }
      return { type, countryId, deployment };
    }
    case 'clear-country':
      return { type };
    case 'set-ready':
      return { type, ready: requireBoolean(action.ready, 'action.ready') };
    case 'start':
      return { type };
    default:
      fail(`Unknown lobby action: ${type}.`);
  }
}

function validateSequencedCommand(value: unknown, index: number): SequencedWorldCommand {
  const ordered = requireRecord(value, `commands[${index}]`);
  return {
    sequence: requireInteger(ordered.sequence, `commands[${index}].sequence`, 1),
    senderPeerId: requireString(ordered.senderPeerId, `commands[${index}].senderPeerId`),
    command: validateWorldCommand(ordered.command),
  };
}

function validateSnapshotSave(value: unknown, tick: number): SaveGameV2 {
  const save = requireRecord(value, 'save');
  if (requireInteger(save.tick, 'save.tick') !== tick) fail('save.tick must match the snapshot tick.');
  requireString(save.rulesVersion, 'save.rulesVersion', 160);
  requireHash(save.canonicalStateHash, 'save.canonicalStateHash');
  requireInteger(save.schemaVersion, 'save.schemaVersion', 1, 10_000);
  return save as unknown as SaveGameV2;
}

export function validateProtocolMessage(value: unknown): MultiplayerProtocolMessage {
  const message = requireRecord(value, 'message');
  const type = requireString(message.type, 'message.type', 40);

  switch (type) {
    case 'hello':
      requireProtocolVersion(message.protocolVersion);
      if (message.role !== 'guest') fail('hello.role must be guest.');
      if ((message.sessionId === undefined) !== (message.rejoinToken === undefined)) {
        fail('hello.sessionId and hello.rejoinToken must be supplied together.');
      }
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: requireString(message.rulesVersion, 'message.rulesVersion', 160),
        roomId: requireString(message.roomId, 'message.roomId'),
        invitationId: requireString(message.invitationId, 'message.invitationId'),
        peerId: requireString(message.peerId, 'message.peerId'),
        displayName: requireString(message.displayName, 'message.displayName', MAX_NAME_LENGTH),
        role: 'guest',
        ...(message.sessionId === undefined ? {} : {
          sessionId: requireString(message.sessionId, 'message.sessionId'),
          rejoinToken: requireString(message.rejoinToken, 'message.rejoinToken'),
        }),
      };
    case 'hello-ack':
      requireProtocolVersion(message.protocolVersion);
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        rulesVersion: requireString(message.rulesVersion, 'message.rulesVersion', 160),
        roomId: requireString(message.roomId, 'message.roomId'),
        invitationId: requireString(message.invitationId, 'message.invitationId'),
        hostPeerId: requireString(message.hostPeerId, 'message.hostPeerId'),
        acceptedPeerId: requireString(message.acceptedPeerId, 'message.acceptedPeerId'),
        maxPlayers: requireInteger(message.maxPlayers, 'message.maxPlayers', MIN_MULTIPLAYER_PLAYERS, MAX_MULTIPLAYER_PLAYERS),
        ...(message.sessionId === undefined ? {} : {
          sessionId: requireString(message.sessionId, 'message.sessionId'),
        }),
        ...(message.rejoinToken === undefined ? {} : {
          rejoinToken: requireString(message.rejoinToken, 'message.rejoinToken'),
        }),
        ...(message.rejoined === undefined ? {} : {
          rejoined: requireBoolean(message.rejoined, 'message.rejoined'),
        }),
      };
    case 'reject':
      requireProtocolVersion(message.protocolVersion);
      return {
        type,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        code: requireString(message.code, 'message.code', 80),
        message: requireString(message.message, 'message.message', MAX_REASON_LENGTH),
      };
    case 'lobby-state': {
      if (!Array.isArray(message.players) || message.players.length < 1 || message.players.length > MAX_MULTIPLAYER_PLAYERS) {
        fail(`message.players must contain 1 through ${MAX_MULTIPLAYER_PLAYERS} players.`);
      }
      const players = message.players.map(validateLobbyPlayer);
      if (new Set(players.map((player) => player.peerId)).size !== players.length) fail('Lobby peer IDs must be unique.');
      const selectedCountries = players.flatMap((player) => player.countryId === null ? [] : [player.countryId]);
      if (new Set(selectedCountries).size !== selectedCountries.length) fail('Lobby countries must be unique.');
      return {
        type,
        revision: requireInteger(message.revision, 'message.revision'),
        hostPeerId: requireString(message.hostPeerId, 'message.hostPeerId'),
        scenario: requireScenarioConfig(message.scenario, 'message.scenario'),
        started: requireBoolean(message.started, 'message.started'),
        players,
      };
    }
    case 'lobby-action':
      return {
        type,
        revision: requireInteger(message.revision, 'message.revision'),
        action: validateLobbyAction(message.action),
      };
    case 'command':
      return {
        type,
        requestId: requireString(message.requestId, 'message.requestId'),
        clientSequence: requireInteger(message.clientSequence, 'message.clientSequence', 1),
        baseTick: requireInteger(message.baseTick, 'message.baseTick'),
        command: validateWorldCommand(message.command),
      };
    case 'command-result': {
      const accepted = requireBoolean(message.accepted, 'message.accepted');
      const assignedSequence = message.assignedSequence === undefined
        ? undefined
        : requireInteger(message.assignedSequence, 'message.assignedSequence', 1);
      if (accepted && assignedSequence === undefined) fail('Accepted commands require an assigned sequence.');
      return {
        type,
        requestId: requireString(message.requestId, 'message.requestId'),
        accepted,
        ...(message.reason === undefined ? {} : { reason: requireString(message.reason, 'message.reason', MAX_REASON_LENGTH) }),
        ...(assignedSequence === undefined ? {} : { assignedSequence }),
      };
    }
    case 'tick': {
      if (!Array.isArray(message.commands) || message.commands.length > 1_000) fail('message.commands must be an array of at most 1000 commands.');
      const commands = message.commands.map(validateSequencedCommand);
      for (let index = 1; index < commands.length; index += 1) {
        if (commands[index]!.sequence <= commands[index - 1]!.sequence) fail('Tick commands must be strictly sequence ordered.');
      }
      return {
        type,
        tick: requireInteger(message.tick, 'message.tick'),
        ...(message.hash === undefined ? {} : { hash: requireHash(message.hash, 'message.hash') }),
        commands,
      };
    }
    case 'speed':
      if (message.speed !== 0 && message.speed !== 1 && message.speed !== 2
        && message.speed !== 3) fail('message.speed must be from 0 through 3.');
      return {
        type,
        speed: message.speed,
        effectiveTick: requireInteger(message.effectiveTick, 'message.effectiveTick'),
      };
    case 'snapshot': {
      const tick = requireInteger(message.tick, 'message.tick');
      if (message.reason !== 'join' && message.reason !== 'resync' && message.reason !== 'reconnect') {
        fail('message.reason is invalid.');
      }
      return {
        type,
        reason: message.reason,
        tick,
        hash: requireHash(message.hash, 'message.hash'),
        nextClientSequence: requireInteger(
          message.nextClientSequence,
          'message.nextClientSequence',
          1,
        ),
        save: validateSnapshotSave(message.save, tick),
      };
    }
    case 'resync-request':
      return {
        type,
        expectedTick: requireInteger(message.expectedTick, 'message.expectedTick'),
        actualTick: requireInteger(message.actualTick, 'message.actualTick'),
        ...(message.expectedHash === undefined ? {} : { expectedHash: requireHash(message.expectedHash, 'message.expectedHash') }),
        ...(message.actualHash === undefined ? {} : { actualHash: requireHash(message.actualHash, 'message.actualHash') }),
        reason: requireString(message.reason, 'message.reason', MAX_REASON_LENGTH),
      };
    default:
      fail(`Unknown multiplayer message type: ${type}.`);
  }
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function encodeProtocolMessage(message: MultiplayerProtocolMessage): string {
  const validated = validateProtocolMessage(message);
  let encoded: string;
  try {
    encoded = JSON.stringify(validated);
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-message', 'The multiplayer message cannot be encoded.', { cause: error });
  }
  if (utf8Length(encoded) > MAX_PROTOCOL_MESSAGE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Multiplayer messages may not exceed ${MAX_PROTOCOL_MESSAGE_BYTES} bytes.`);
  }
  return encoded;
}

export function decodeProtocolMessage(encoded: string): MultiplayerProtocolMessage {
  if (typeof encoded !== 'string') fail('The multiplayer payload must be text.');
  if (utf8Length(encoded) > MAX_PROTOCOL_MESSAGE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Multiplayer messages may not exceed ${MAX_PROTOCOL_MESSAGE_BYTES} bytes.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-message', 'The multiplayer payload is not valid JSON.', { cause: error });
  }
  return validateProtocolMessage(parsed);
}

function validateWireMessageId(messageId: string): void {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(messageId)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Wire message IDs must be 8-80 URL-safe characters.');
  }
}

function splitWithoutBreakingSurrogates(value: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < value.length) {
    let end = Math.min(value.length, start + WIRE_CHUNK_CODE_UNITS);
    if (end < value.length) {
      const last = value.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end -= 1;
    }
    chunks.push(value.slice(start, end));
    start = end;
  }
  return chunks;
}

/** Frames one validated message below conservative cross-browser SCTP message sizes. */
export function encodeWireFrames(message: MultiplayerProtocolMessage, messageId: string): string[] {
  validateWireMessageId(messageId);
  const encoded = encodeProtocolMessage(message);
  const chunks = splitWithoutBreakingSurrogates(encoded);
  if (chunks.length > MAX_WIRE_FRAGMENTS) {
    throw new MultiplayerProtocolError('message-too-large', 'The multiplayer message requires too many wire frames.');
  }
  return chunks.map((chunk, part) => {
    const frame = `${WIRE_FRAME_PREFIX}${messageId}|${part}|${chunks.length}|${chunk}`;
    if (utf8Length(frame) > MAX_DATA_CHANNEL_FRAME_BYTES) {
      throw new MultiplayerProtocolError('message-too-large', 'A multiplayer wire frame exceeds the safe data-channel size.');
    }
    return frame;
  });
}

interface ParsedWireFrame {
  messageId: string;
  part: number;
  total: number;
  payload: string;
}

export function parseWireFrame(frame: string): ParsedWireFrame {
  if (typeof frame !== 'string' || utf8Length(frame) > MAX_DATA_CHANNEL_FRAME_BYTES || !frame.startsWith(WIRE_FRAME_PREFIX)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Invalid multiplayer wire frame.');
  }
  const idEnd = frame.indexOf('|', WIRE_FRAME_PREFIX.length);
  const partEnd = idEnd < 0 ? -1 : frame.indexOf('|', idEnd + 1);
  const totalEnd = partEnd < 0 ? -1 : frame.indexOf('|', partEnd + 1);
  if (idEnd < 0 || partEnd < 0 || totalEnd < 0) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Incomplete multiplayer wire-frame header.');
  }
  const messageId = frame.slice(WIRE_FRAME_PREFIX.length, idEnd);
  validateWireMessageId(messageId);
  const partText = frame.slice(idEnd + 1, partEnd);
  const totalText = frame.slice(partEnd + 1, totalEnd);
  if (!/^\d{1,3}$/.test(partText) || !/^\d{1,3}$/.test(totalText)) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Invalid multipart wire-frame counters.');
  }
  const part = Number(partText);
  const total = Number(totalText);
  if (total < 1 || total > MAX_WIRE_FRAGMENTS || part < 0 || part >= total) {
    throw new MultiplayerProtocolError('invalid-wire-frame', 'Multipart wire-frame counters are out of range.');
  }
  return { messageId, part, total, payload: frame.slice(totalEnd + 1) };
}

interface PendingWireMessage {
  createdAt: number;
  total: number;
  byteLength: number;
  parts: Array<string | undefined>;
  received: number;
}

/** Per-peer ordered-frame assembler with strict memory and age bounds. */
export class WireMessageAssembler {
  private readonly pending = new Map<string, PendingWireMessage>();

  accept(frameText: string, now = Date.now()): MultiplayerProtocolMessage | null {
    this.expire(now);
    const frame = parseWireFrame(frameText);
    let pending = this.pending.get(frame.messageId);
    if (!pending) {
      if (this.pending.size >= MAX_PENDING_WIRE_MESSAGES) {
        throw new MultiplayerProtocolError('invalid-wire-frame', 'Too many incomplete multiplayer messages.');
      }
      pending = {
        createdAt: now,
        total: frame.total,
        byteLength: 0,
        parts: new Array<string | undefined>(frame.total),
        received: 0,
      };
      this.pending.set(frame.messageId, pending);
    } else if (pending.total !== frame.total) {
      this.pending.delete(frame.messageId);
      throw new MultiplayerProtocolError('invalid-wire-frame', 'Wire-frame totals changed within one message.');
    }

    const existing = pending.parts[frame.part];
    if (existing !== undefined) {
      if (existing !== frame.payload) {
        this.pending.delete(frame.messageId);
        throw new MultiplayerProtocolError('invalid-wire-frame', 'A duplicate wire frame contained conflicting data.');
      }
      return null;
    }

    pending.parts[frame.part] = frame.payload;
    pending.received += 1;
    pending.byteLength += utf8Length(frame.payload);
    if (pending.byteLength > MAX_PROTOCOL_MESSAGE_BYTES) {
      this.pending.delete(frame.messageId);
      throw new MultiplayerProtocolError('message-too-large', 'The reassembled multiplayer message is too large.');
    }
    if (pending.received !== pending.total) return null;

    this.pending.delete(frame.messageId);
    return decodeProtocolMessage(pending.parts.join(''));
  }

  clear(): void {
    this.pending.clear();
  }

  private expire(now: number): void {
    for (const [messageId, pending] of this.pending) {
      if (now - pending.createdAt > WIRE_MESSAGE_TTL_MS) this.pending.delete(messageId);
    }
  }
}

const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encodeBase64Url(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const left = bytes[index]!;
    const middle = bytes[index + 1];
    const right = bytes[index + 2];
    result += BASE64_URL_ALPHABET[left >>> 2];
    result += BASE64_URL_ALPHABET[((left & 3) << 4) | ((middle ?? 0) >>> 4)];
    if (middle !== undefined) result += BASE64_URL_ALPHABET[((middle & 15) << 2) | ((right ?? 0) >>> 6)];
    if (right !== undefined) result += BASE64_URL_ALPHABET[right & 63];
  }
  return result;
}

function decodeBase64Url(encoded: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code is not valid base64url.');
  }
  const values = new Uint8Array(128);
  values.fill(255);
  for (let index = 0; index < BASE64_URL_ALPHABET.length; index += 1) {
    values[BASE64_URL_ALPHABET.charCodeAt(index)] = index;
  }
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index += 4) {
    const a = values[encoded.charCodeAt(index)]!;
    const b = values[encoded.charCodeAt(index + 1)]!;
    const c = index + 2 < encoded.length ? values[encoded.charCodeAt(index + 2)]! : 0;
    const d = index + 3 < encoded.length ? values[encoded.charCodeAt(index + 3)]! : 0;
    if (a === 255 || b === 255 || c === 255 || d === 255) {
      throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code contains invalid characters.');
    }
    bytes.push((a << 2) | (b >>> 4));
    if (index + 2 < encoded.length) bytes.push(((b & 15) << 4) | (c >>> 2));
    if (index + 3 < encoded.length) bytes.push(((c & 3) << 6) | d);
  }
  return Uint8Array.from(bytes);
}

function validateSignal(value: unknown): DirectSignal {
  const signal = requireRecord(value, 'signal');
  const kind = requireString(signal.kind, 'signal.kind', 32);
  requireProtocolVersion(signal.protocolVersion);
  const common = {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    rulesVersion: requireString(signal.rulesVersion, 'signal.rulesVersion', 160),
    roomId: requireString(signal.roomId, 'signal.roomId'),
    invitationId: requireString(signal.invitationId, 'signal.invitationId'),
  };
  const description = requireRecord(signal.description, 'signal.description');
  const sdp = requireString(description.sdp, 'signal.description.sdp', MAX_SIGNAL_CODE_BYTES);
  if (kind === 'direct-invite') {
    if (description.type !== 'offer') fail('An invite must contain an offer description.');
    return {
      kind,
      ...common,
      hostPeerId: requireString(signal.hostPeerId, 'signal.hostPeerId'),
      hostName: requireString(signal.hostName, 'signal.hostName', MAX_NAME_LENGTH),
      description: { type: 'offer', sdp },
    };
  }
  if (kind === 'direct-answer') {
    if (description.type !== 'answer') fail('An answer must contain an answer description.');
    return {
      kind,
      ...common,
      guestPeerId: requireString(signal.guestPeerId, 'signal.guestPeerId'),
      guestName: requireString(signal.guestName, 'signal.guestName', MAX_NAME_LENGTH),
      description: { type: 'answer', sdp },
    };
  }
  throw new MultiplayerProtocolError('invalid-signal', `Unknown Direct Connect signal kind: ${kind}.`);
}

export function encodeSignalCode(signal: DirectSignal): string {
  const validated = validateSignal(signal);
  const bytes = new TextEncoder().encode(JSON.stringify(validated));
  if (bytes.byteLength > MAX_SIGNAL_CODE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} bytes.`);
  }
  return `${SIGNAL_CODE_PREFIX}.${encodeBase64Url(bytes)}`;
}

export function decodeSignalCode(code: string): DirectSignal {
  if (typeof code !== 'string') {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code must be text.');
  }
  const compact = code.trim();
  if (!compact.startsWith(`${SIGNAL_CODE_PREFIX}.`)) {
    throw new MultiplayerProtocolError('invalid-signal', 'This is not an EONSCAR Direct Connect code.');
  }
  const maximumEncodedLength = SIGNAL_CODE_PREFIX.length + 1 + Math.ceil(MAX_SIGNAL_CODE_BYTES * 4 / 3);
  if (compact.length > maximumEncodedLength) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} decoded bytes.`);
  }
  const encoded = compact.slice(SIGNAL_CODE_PREFIX.length + 1);
  const bytes = decodeBase64Url(encoded);
  if (bytes.byteLength > MAX_SIGNAL_CODE_BYTES) {
    throw new MultiplayerProtocolError('message-too-large', `Direct Connect codes may not exceed ${MAX_SIGNAL_CODE_BYTES} bytes.`);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code is not valid UTF-8.', { cause: error });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new MultiplayerProtocolError('invalid-signal', 'The Direct Connect code does not contain valid JSON.', { cause: error });
  }
  try {
    return validateSignal(parsed);
  } catch (error) {
    if (error instanceof MultiplayerProtocolError && error.code === 'invalid-message') {
      throw new MultiplayerProtocolError('invalid-signal', error.message, { cause: error });
    }
    throw error;
  }
}

export function assertSignalCompatibility(
  signal: DirectSignal,
  rulesVersion: string,
  expected?: { roomId?: string; invitationId?: string },
): void {
  if (signal.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
    throw new MultiplayerProtocolError('incompatible-protocol', 'The other player uses an incompatible multiplayer protocol.');
  }
  if (signal.rulesVersion !== rulesVersion) {
    throw new MultiplayerProtocolError(
      'incompatible-rules',
      `Game rules do not match (${signal.rulesVersion} versus ${rulesVersion}).`,
    );
  }
  if (expected?.roomId !== undefined && signal.roomId !== expected.roomId) {
    throw new MultiplayerProtocolError('invalid-signal', 'This answer belongs to a different room.');
  }
  if (expected?.invitationId !== undefined && signal.invitationId !== expected.invitationId) {
    throw new MultiplayerProtocolError('invalid-signal', 'This answer belongs to a different invitation.');
  }
}

export function isSessionMessage(message: MultiplayerProtocolMessage): message is SessionMessage {
  return message.type !== 'hello' && message.type !== 'hello-ack' && message.type !== 'reject';
}
