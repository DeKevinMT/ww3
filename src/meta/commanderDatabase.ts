import {
  createCommanderProfileV1,
  normalizeCommanderProfileV1,
  type CommanderProfileV1,
} from './commanderProfile';
import {
  CAMPAIGN_SLOT_STORAGE_KEY,
  COMMANDER_PROFILE_STORAGE_KEY,
  loadCampaignSlotV1,
  type KeyValueStorage,
  type StoredCampaignV1,
} from './commanderStorage';

const DATABASE_NAME = 'frontier-command-meta-v1';
const DATABASE_VERSION = 1;
const STORE_NAME = 'records';

interface DatabaseRecordV1 {
  key: string;
  value: string;
}

class SingleValueStorage implements KeyValueStorage {
  private value: string | null;

  constructor(private readonly key: string, value: string | null) {
    this.value = value;
  }

  getItem(key: string): string | null { return key === this.key ? this.value : null; }
  setItem(key: string, value: string): void { if (key === this.key) this.value = value; }
  removeItem(key: string): void { if (key === this.key) this.value = null; }
}

function parseProfile(value: string | null, now: number): CommanderProfileV1 | undefined {
  if (!value) return undefined;
  try {
    return normalizeCommanderProfileV1(JSON.parse(value) as unknown, now);
  } catch {
    return undefined;
  }
}

function parseCampaign(value: string | null): StoredCampaignV1 | undefined {
  if (!value) return undefined;
  return loadCampaignSlotV1(new SingleValueStorage(CAMPAIGN_SLOT_STORAGE_KEY, value));
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Browser database request failed.'));
  });
}

/** IndexedDB is the primary campaign store; localStorage is a verified emergency copy. */
export class CommanderDatabaseV1 {
  private databasePromise?: Promise<IDBDatabase>;

  constructor(
    private readonly fallback: KeyValueStorage,
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  async loadProfile(now = Date.now()): Promise<CommanderProfileV1> {
    const [databaseValue, fallbackValue] = await Promise.all([
      this.readDatabase(COMMANDER_PROFILE_STORAGE_KEY),
      Promise.resolve(this.fallback.getItem(COMMANDER_PROFILE_STORAGE_KEY)),
    ]);
    const candidates = [parseProfile(databaseValue, now), parseProfile(fallbackValue, now)]
      .filter((profile): profile is CommanderProfileV1 => Boolean(profile));
    const profile = candidates.sort((a, b) => b.revision - a.revision || b.updatedAt - a.updatedAt)[0]
      ?? createCommanderProfileV1(now);
    await this.writeBoth(COMMANDER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
    return profile;
  }

  async saveProfile(profile: CommanderProfileV1, now = Date.now()): Promise<CommanderProfileV1> {
    const normalized = normalizeCommanderProfileV1({ ...profile, updatedAt: now }, now);
    await this.writeBoth(COMMANDER_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  async loadCampaign(): Promise<StoredCampaignV1 | undefined> {
    const [databaseValue, fallbackValue] = await Promise.all([
      this.readDatabase(CAMPAIGN_SLOT_STORAGE_KEY),
      Promise.resolve(this.fallback.getItem(CAMPAIGN_SLOT_STORAGE_KEY)),
    ]);
    const campaigns = [parseCampaign(databaseValue), parseCampaign(fallbackValue)]
      .filter((campaign): campaign is StoredCampaignV1 => Boolean(campaign));
    const campaign = campaigns.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (campaign) await this.writeBoth(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(campaign));
    return campaign;
  }

  async saveCampaign(campaign: StoredCampaignV1): Promise<void> {
    await this.writeBoth(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(campaign));
  }

  async clearCampaign(): Promise<void> {
    this.fallback.removeItem(CAMPAIGN_SLOT_STORAGE_KEY);
    await this.deleteDatabase(CAMPAIGN_SLOT_STORAGE_KEY);
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (!this.factory) return Promise.reject(new Error('IndexedDB unavailable.'));
    if (!this.databasePromise) {
      this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = this.factory!.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Unable to open browser database.'));
      });
    }
    return this.databasePromise;
  }

  private async readDatabase(key: string): Promise<string | null> {
    try {
      const database = await this.openDatabase();
      const request = database.transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME).get(key) as IDBRequest<DatabaseRecordV1 | undefined>;
      return (await requestResult(request))?.value ?? null;
    } catch {
      return null;
    }
  }

  private async writeBoth(key: string, value: string): Promise<void> {
    // Commit the synchronous emergency copy before the first await. Menu
    // actions intentionally fire-and-forget this promise, so closing the tab
    // immediately after an unlock or talent allocation must still be safe.
    let backupVerified = false;
    try {
      this.fallback.setItem(key, value);
      backupVerified = this.fallback.getItem(key) === value;
    } catch {
      // Large world saves can exceed localStorage while remaining safe in IDB.
    }
    let primaryVerified = false;
    try {
      const database = await this.openDatabase();
      const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
      await requestResult(store.put({ key, value } satisfies DatabaseRecordV1));
      const verified = await this.readDatabase(key);
      if (verified !== value) throw new Error('Campaign database verification failed.');
      primaryVerified = true;
    } catch {
      // The verified synchronous backup remains authoritative when IDB is blocked.
    }
    if (!primaryVerified && !backupVerified) throw new Error('Campaign save verification failed.');
  }

  private async deleteDatabase(key: string): Promise<void> {
    try {
      const database = await this.openDatabase();
      const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
      await requestResult(store.delete(key));
    } catch {
      // A missing/blocked primary store is already equivalent to an empty slot.
    }
  }
}
