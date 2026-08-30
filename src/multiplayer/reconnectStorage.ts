import type { ScenarioConfigV2 } from '../sim/v2/scenarios';
import type { DirectReconnectCredential } from './directConnect';
import {
  validateMultiplayerDeploymentSnapshotV1,
  type MultiplayerDeploymentSnapshotV1,
} from './protocol';

export const GUEST_RECONNECT_SESSION_STORAGE_KEY = 'frontier-command:active-multiplayer-seat:v1';
export const GUEST_RECONNECT_SESSION_TTL_MS = 5 * 60_000;

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredGuestReconnectSessionV1 {
  readonly schemaVersion: 1;
  readonly roomId: string;
  readonly rulesVersion: string;
  readonly displayName: string;
  readonly credential: DirectReconnectCredential;
  readonly scenario: ScenarioConfigV2;
  readonly countryId: string;
  readonly seatCount: number;
  readonly humanPlayerIds: readonly string[];
  readonly controllerNames: readonly (readonly [string, string])[];
  /** Needed to restore runtime-only Country Mastery before snapshot hydration. */
  readonly deployments: readonly MultiplayerDeploymentSnapshotV1[];
  readonly expiresAt: number;
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

function validMode(value: unknown): value is ScenarioConfigV2['mode'] {
  return value === 'standard-2026' || value === 'random-world' || value === 'survival';
}

function parseStoredGuestReconnectSessionV1(value: unknown): StoredGuestReconnectSessionV1 | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Partial<StoredGuestReconnectSessionV1>;
  const credential = entry.credential as Partial<DirectReconnectCredential> | undefined;
  const scenario = entry.scenario as Partial<ScenarioConfigV2> | undefined;
  let deployments: MultiplayerDeploymentSnapshotV1[];
  try {
    if (!Array.isArray(entry.deployments)) return undefined;
    deployments = entry.deployments.map((deployment, index) => (
      validateMultiplayerDeploymentSnapshotV1(deployment, `deployments[${index}]`)
    ));
  } catch {
    return undefined;
  }
  if (entry.schemaVersion !== 1
    || !boundedString(entry.roomId, 160)
    || !boundedString(entry.rulesVersion, 120)
    || !boundedString(entry.displayName, 80)
    || !credential
    || !boundedString(credential.sessionId, 160)
    || !boundedString(credential.peerId, 160)
    || !boundedString(credential.rejoinToken, 256)
    || !scenario
    || !validMode(scenario.mode)
    || scenario.version !== 1
    || !Number.isSafeInteger(scenario.seed) || Number(scenario.seed) <= 0
    || !boundedString(entry.countryId, 80)
    || !Number.isSafeInteger(entry.seatCount) || Number(entry.seatCount) < 2 || Number(entry.seatCount) > 8
    || !Array.isArray(entry.humanPlayerIds)
    || entry.humanPlayerIds.length !== entry.seatCount
    || !entry.humanPlayerIds.every((id) => boundedString(id, 80))
    || new Set(entry.humanPlayerIds).size !== entry.seatCount
    || !entry.humanPlayerIds.includes(entry.countryId)
    || !Array.isArray(entry.controllerNames)
    || !entry.controllerNames.every((pair) => Array.isArray(pair) && pair.length === 2
      && boundedString(pair[0], 80) && boundedString(pair[1], 80))
    || !Number.isSafeInteger(entry.expiresAt) || Number(entry.expiresAt) <= 0) return undefined;
  const humanPlayerIds = entry.humanPlayerIds;
  if (deployments.length !== entry.seatCount
    || new Set(deployments.map((deployment) => deployment.countryId)).size !== entry.seatCount
    || deployments.some((deployment) => !humanPlayerIds.includes(deployment.countryId))) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    roomId: entry.roomId,
    rulesVersion: entry.rulesVersion,
    displayName: entry.displayName,
    credential: {
      sessionId: credential.sessionId,
      peerId: credential.peerId,
      rejoinToken: credential.rejoinToken,
    },
    scenario: {
      mode: scenario.mode,
      version: 1,
      seed: Number(scenario.seed),
    },
    countryId: entry.countryId,
    seatCount: Number(entry.seatCount),
    humanPlayerIds: [...new Set(humanPlayerIds)],
    controllerNames: entry.controllerNames.map(([id, name]) => [id, name] as const),
    deployments: deployments
      .sort((left, right) => left.countryId.localeCompare(right.countryId)),
    expiresAt: Number(entry.expiresAt),
  };
}

export function saveGuestReconnectSessionV1(
  storage: SessionStorageLike,
  session: StoredGuestReconnectSessionV1,
): boolean {
  const canonical = parseStoredGuestReconnectSessionV1(session);
  if (!canonical) return false;
  try {
    storage.setItem(GUEST_RECONNECT_SESSION_STORAGE_KEY, JSON.stringify(canonical));
    return true;
  } catch {
    return false;
  }
}

export function loadGuestReconnectSessionV1(
  storage: SessionStorageLike,
  now = Date.now(),
): StoredGuestReconnectSessionV1 | undefined {
  try {
    const raw = storage.getItem(GUEST_RECONNECT_SESSION_STORAGE_KEY);
    if (!raw) return undefined;
    const session = parseStoredGuestReconnectSessionV1(JSON.parse(raw));
    if (!session || session.expiresAt <= now) {
      storage.removeItem(GUEST_RECONNECT_SESSION_STORAGE_KEY);
      return undefined;
    }
    return session;
  } catch {
    try {
      storage.removeItem(GUEST_RECONNECT_SESSION_STORAGE_KEY);
    } catch {
      // Session storage may be unavailable in hardened browser contexts.
    }
    return undefined;
  }
}

export function refreshGuestReconnectSessionV1(
  storage: SessionStorageLike,
  session: StoredGuestReconnectSessionV1,
  now = Date.now(),
): StoredGuestReconnectSessionV1 {
  const refreshed = { ...session, expiresAt: now + GUEST_RECONNECT_SESSION_TTL_MS };
  saveGuestReconnectSessionV1(storage, refreshed);
  return refreshed;
}

export function clearGuestReconnectSessionV1(storage: SessionStorageLike): void {
  try {
    storage.removeItem(GUEST_RECONNECT_SESSION_STORAGE_KEY);
  } catch {
    // The live connection remains valid when session storage is unavailable.
  }
}
