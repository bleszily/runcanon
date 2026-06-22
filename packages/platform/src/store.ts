import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { platformStoreSchema, type PlatformStore, type ProviderConfig } from "./types.js";
import { dataDir as resolveDataDir } from "./env.js";

export function dataDir(): string {
  return resolveDataDir();
}

function storePath(): string {
  return join(dataDir(), "platform.json");
}

export function emptyStore(): PlatformStore {
  return {
    schemaVersion: "1.0.0",
    users: [],
    sessions: [],
    apiTokens: [],
    cliAuthChallenges: [],
    providers: [],
    workspaces: [],
    userPreferences: [],
  };
}

function migrateLegacyProviders(store: PlatformStore): PlatformStore {
  const idMap: Record<string, ProviderConfig["id"]> = {
    codex: "openai",
    antigravity: "vertex",
  };
  for (const provider of store.providers) {
    const mapped = idMap[provider.id as string];
    if (mapped) provider.id = mapped;
  }
  return store;
}

function migrateUsers(store: PlatformStore): PlatformStore {
  for (const user of store.users) {
    if (user.mustResetPassword === undefined) {
      user.mustResetPassword = false;
    }
  }
  return store;
}

export async function readStore(): Promise<PlatformStore> {
  try {
    const raw = await readFile(storePath(), "utf-8");
    const parsed = platformStoreSchema.parse(JSON.parse(raw));
    return migrateUsers(migrateLegacyProviders(parsed));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyStore();
    }
    throw error;
  }
}

export async function writeStore(store: PlatformStore): Promise<void> {
  await mkdir(dataDir(), { recursive: true });
  const path = storePath();
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), "utf-8");
  await rename(temp, path);
}

export async function mutateStore<T>(fn: (store: PlatformStore) => T | Promise<T>): Promise<T> {
  const store = await readStore();
  const result = await fn(store);
  await writeStore(store);
  return result;
}

export function workspacesDir(): string {
  return join(dataDir(), "workspaces");
}
