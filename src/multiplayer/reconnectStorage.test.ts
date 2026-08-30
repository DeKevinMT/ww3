import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  GUEST_RECONNECT_SESSION_STORAGE_KEY,
  GUEST_RECONNECT_SESSION_TTL_MS,
  clearGuestReconnectSessionV1,
  loadGuestReconnectSessionV1,
  refreshGuestReconnectSessionV1,
  saveGuestReconnectSessionV1,
  type StoredGuestReconnectSessionV1,
} from './reconnectStorage';
import { createNeutralMultiplayerDeploymentSnapshotV1 } from './deployment';

class MemorySessionStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function fixture(expiresAt = 20_000): StoredGuestReconnectSessionV1 {
  return {
    schemaVersion: 1,
    roomId: 'room_refresh',
    rulesVersion: 'frontier-v2.72',
    displayName: 'Guest Commander',
    credential: {
      sessionId: 'campaign_session',
      peerId: 'guest_stable',
      rejoinToken: 'secret_token_never_rendered',
    },
    scenario: { mode: 'survival', version: 1, seed: 77 },
    countryId: 'bel',
    seatCount: 2,
    humanPlayerIds: ['bel', 'nld'],
    controllerNames: [['bel', 'Guest Commander'], ['nld', 'Host Commander']],
    deployments: [
      createNeutralMultiplayerDeploymentSnapshotV1('bel'),
      createNeutralMultiplayerDeploymentSnapshotV1('nld'),
    ],
    expiresAt,
  };
}

describe('session-scoped multiplayer rejoin metadata', () => {
  it('round-trips only the active seat context and secret credential', () => {
    const storage = new MemorySessionStorage();
    expect(saveGuestReconnectSessionV1(storage, fixture())).toBe(true);
    const loaded = loadGuestReconnectSessionV1(storage, 10_000);
    expect(loaded).toEqual(fixture());
    const raw = storage.values.get(GUEST_RECONNECT_SESSION_STORAGE_KEY)!;
    expect(raw).not.toContain('unlockedCountryIds');
    expect(raw).not.toContain('commandCredits');
    expect(raw).not.toContain('commanderTalents');
    expect(raw).toContain('countryMastery');
    const apex = loaded!.deployments[0]!.apex;
    expect(apex).toMatchObject({
      shield: {
        integrity: 0.0004,
        maxIntegrity: 0.0004,
        pulseAttack: 0.001,
      },
      attackMultiplier: 1.12,
      defenseMultiplier: 1.07,
      supplyStock: 0.010,
    });
    expect(Object.keys(apex).sort()).toEqual([
      'annualOutput', 'armyCasualtyMultiplier', 'armyPeaceRecoveryMultiplier',
      'attackMultiplier', 'capabilities', 'countryTraitScale', 'defenseMultiplier',
      'empireSupport', 'shield', 'supplyStock', 'treasury',
    ]);
  });

  it('refreshes while active, then clears an expired or discarded seat', () => {
    const storage = new MemorySessionStorage();
    const refreshed = refreshGuestReconnectSessionV1(storage, fixture(), 50_000);
    expect(refreshed.expiresAt).toBe(50_000 + GUEST_RECONNECT_SESSION_TTL_MS);
    expect(loadGuestReconnectSessionV1(storage, refreshed.expiresAt - 1)).toBeDefined();
    expect(loadGuestReconnectSessionV1(storage, refreshed.expiresAt)).toBeUndefined();
    expect(storage.values.has(GUEST_RECONNECT_SESSION_STORAGE_KEY)).toBe(false);
    saveGuestReconnectSessionV1(storage, fixture());
    clearGuestReconnectSessionV1(storage);
    expect(storage.values.size).toBe(0);
  });

  it('rejects corrupted identity, roster and scenario data without exposing it', () => {
    const storage = new MemorySessionStorage();
    storage.values.set(GUEST_RECONNECT_SESSION_STORAGE_KEY, JSON.stringify({
      ...fixture(),
      humanPlayerIds: ['nld'],
    }));
    expect(loadGuestReconnectSessionV1(storage, 10_000)).toBeUndefined();
    expect(storage.values.size).toBe(0);
  });

  it('wires reload recovery to one menu action and a fresh host snapshot', () => {
    const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(mainSource).toContain('activeGuestReconnectSession = loadGuestReconnectSessionV1(window.sessionStorage)');
    expect(mainSource).toContain('onResumeMultiplayer: resumeStoredGuestMatch');
    expect(mainSource).toContain('function resumeStoredGuestMatch(): void');
    expect(mainSource).toContain('session = new GuestGameSession({');
    expect(mainSource).toContain('attachGuestStatus(session, reconnect)');
    expect(mainSource).toContain('pageUnloading = true');
    expect(mainSource).toContain('refreshActiveGuestReconnectSession(true)');
  });
});
