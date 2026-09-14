import { BindingProfile } from "./contracts.js";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ProfileStore {
  listProfileIds(namespace: string): Promise<string[]>;
  loadProfile(namespace: string, profileId: string): Promise<BindingProfile | null>;
  saveProfile(namespace: string, profile: BindingProfile): Promise<void>;
  deleteProfile(namespace: string, profileId: string): Promise<void>;
}

interface SerializedStoreState {
  [namespace: string]: string[];
}

const PROFILE_PREFIX = "gamepad-tools:profiles";

function profileEntryKey(namespace: string, profileId: string): string {
  return `${PROFILE_PREFIX}:${namespace}:profile:${profileId}`;
}

function namespaceListKey(namespace: string): string {
  return `${PROFILE_PREFIX}:${namespace}:index`;
}

function createInMemoryStore(): StorageLike {
  const memory = new Map<string, string>();
  return {
    getItem(key) {
      const value = memory.get(key);
      return value === undefined ? null : value;
    },
    setItem(key, value) {
      memory.set(key, value);
    },
    removeItem(key) {
      memory.delete(key);
    },
  };
}

function createStorageAdapter(namespace: string): StorageLike {
  if (typeof globalThis !== "undefined" && typeof (globalThis as any).localStorage !== "undefined") {
    const storage = (globalThis as any).localStorage as Storage;
    try {
      const probe = `${PROFILE_PREFIX}:probe`;
      storage.setItem(probe, "ok");
      const readBack = storage.getItem(probe);
      storage.removeItem(probe);
      if (readBack === "ok") {
        return storage;
      }
    } catch {
      // fall through to memory storage
    }
  }

  return createInMemoryStore();
}

async function readNamespaceList(storage: StorageLike, namespace: string): Promise<string[]> {
  const raw = storage.getItem(namespaceListKey(namespace));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as SerializedStoreState;
    const ids = parsed[namespace];
    return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function writeNamespaceList(storage: StorageLike, namespace: string, ids: string[]): Promise<void> {
  const next = Array.from(new Set(ids.filter((id) => !!id)));
  const raw = JSON.stringify({ [namespace]: next });
  storage.setItem(namespaceListKey(namespace), raw);
}

export function createProfileStore(): ProfileStore {
  const storage = createStorageAdapter(PROFILE_PREFIX);

  return {
    async listProfileIds(namespace) {
      return readNamespaceList(storage, namespace);
    },
    async loadProfile(namespace, profileId) {
      const raw = storage.getItem(profileEntryKey(namespace, profileId));
      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as { profile: BindingProfile };
        return parsed.profile;
      } catch {
        return null;
      }
    },
    async saveProfile(namespace, profile) {
      const ids = await readNamespaceList(storage, namespace);
      const nextIds = Array.from(new Set([...ids, profile.profileId]));

      storage.setItem(profileEntryKey(namespace, profile.profileId), JSON.stringify({ profile }));
      await writeNamespaceList(storage, namespace, nextIds);
    },
    async deleteProfile(namespace, profileId) {
      storage.removeItem(profileEntryKey(namespace, profileId));
      const ids = await readNamespaceList(storage, namespace);
      const nextIds = ids.filter((id) => id !== profileId);
      await writeNamespaceList(storage, namespace, nextIds);
    },
  };
}
