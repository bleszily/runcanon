import { parseConfig, saveConfig, DEFAULT_TRAJECTORY_STORAGE } from "@runcanon/core";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { getRequestContext } from "./context.js";
import { createWorkspace as createWorkspaceRecord, findWorkspaceById } from "./providers.js";
import { mutateStore, readStore } from "./store.js";
import type { Workspace } from "./types.js";

async function ensureWorkspaceConfig(storagePath: string, name: string): Promise<void> {
  const configPath = join(storagePath, "runcanon.config.yaml");
  try {
    await access(configPath);
  } catch {
    await saveConfig(
      storagePath,
      parseConfig({
        project: name,
        scope: ["personal"],
        goals: [],
        harnesses: ["claude", "cursor", "copilot", "codex"],
        autonomy: "ask",
        telemetry: { enabled: true, retentionDays: 90, storagePath: DEFAULT_TRAJECTORY_STORAGE },
        mining: { schedule: "manual", minClusterSize: 2, distanceThreshold: 0.45 },
      })
    );
  }
}

/** Create a personal workspace for a user if they do not own one yet. */
export async function ensureUserWorkspace(userId: string, displayName: string, email: string): Promise<Workspace> {
  const store = await readStore();
  const owned = store.workspaces.filter((w) => w.ownerId === userId);
  if (owned.length > 0) {
    const preferred = store.userPreferences.find((p) => p.userId === userId);
    const active = preferred ? owned.find((w) => w.id === preferred.activeWorkspaceId) : owned[0];
    return active ?? owned[0]!;
  }

  const label = displayName.trim() || email.split("@")[0] || "User";
  const workspace = await createWorkspaceRecord({
    name: `${label}'s workspace`,
    description: `Personal workspace for ${email}`,
    ownerId: userId,
  });

  await mutateStore((s) => {
    const existing = s.userPreferences.find((p) => p.userId === userId);
    if (existing) {
      existing.activeWorkspaceId = workspace.id;
    } else {
      s.userPreferences.push({ userId, activeWorkspaceId: workspace.id });
    }
  });

  await ensureWorkspaceConfig(workspace.storagePath, workspace.name);
  return workspace;
}

export async function listWorkspacesForUser(userId: string, isAdmin: boolean): Promise<Workspace[]> {
  const store = await readStore();
  if (isAdmin) {
    return store.workspaces;
  }
  return store.workspaces.filter((w) => w.ownerId === userId);
}

export async function getActiveWorkspaceForUser(userId?: string, isAdmin = false): Promise<Workspace | undefined> {
  const store = await readStore();
  if (!userId) {
    return store.workspaces.find((w) => w.id === store.defaultWorkspaceId) ?? store.workspaces[0];
  }

  const user = store.users.find((u) => u.id === userId);
  let owned = store.workspaces.filter((w) => w.ownerId === userId);
  if (owned.length === 0 && user) {
    return ensureUserWorkspace(userId, user.name, user.email);
  }

  const refreshed = await readStore();
  const preference = refreshed.userPreferences.find((p) => p.userId === userId);
  const visible = isAdmin ? refreshed.workspaces : refreshed.workspaces.filter((w) => w.ownerId === userId);

  if (preference) {
    const preferred = visible.find((w) => w.id === preference.activeWorkspaceId);
    if (preferred) return preferred;
  }

  return visible[0] ?? refreshed.workspaces.find((w) => w.ownerId === userId);
}

export async function setUserActiveWorkspace(
  userId: string,
  workspaceId: string,
  isAdmin: boolean
): Promise<Workspace> {
  const store = await readStore();
  const workspace = store.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  if (!isAdmin && workspace.ownerId !== userId) {
    throw new Error("You can only switch to your own workspaces");
  }

  await mutateStore((s) => {
    const existing = s.userPreferences.find((p) => p.userId === userId);
    if (existing) {
      existing.activeWorkspaceId = workspaceId;
    } else {
      s.userPreferences.push({ userId, activeWorkspaceId: workspaceId });
    }
  });

  return workspace;
}

/** Resolve storage root for the current request user. */
export async function resolveWorkspaceRoot(): Promise<string> {
  const { userId, isAdmin } = getRequestContext();
  const workspace = await getActiveWorkspaceForUser(userId, isAdmin);
  if (workspace) {
    return workspace.storagePath;
  }
  return process.env.RUNCANON_PROJECT_PATH ?? process.cwd();
}

export { ensureWorkspaceConfig, findWorkspaceById };
