import { resolve } from "node:path";

import { loadConfig, saveConfig } from "@runcanon/core";

import { loadCredentials, type CliCredentials } from "./remote.js";
import { fetchRemoteConfig, updateRemoteGoals } from "./remote-sync.js";

export function normalizeGoals(input: string[]): string[] {
  const seen = new Set<string>();
  const goals: string[] = [];
  for (const raw of input) {
    const goal = raw.trim();
    if (!goal) continue;
    const key = goal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    goals.push(goal);
  }
  return goals;
}

function resolveProjectPath(projectPath?: string): string {
  return resolve(projectPath ?? ".");
}

async function saveLocalGoals(projectPath: string, goals: string[]): Promise<void> {
  const config = await loadConfig(projectPath);
  config.goals = goals;
  await saveConfig(projectPath, config);
}

export async function listGoals(options: {
  project?: string;
  workspaceId?: string;
}): Promise<{ goals: string[]; mode: "connected" | "local"; workspaceId?: string; projectPath?: string }> {
  const creds = await loadCredentials();
  if (creds) {
    const remote = await fetchRemoteConfig(creds, options.workspaceId);
    return {
      mode: "connected",
      goals: remote.config?.goals ?? [],
      workspaceId: remote.workspaceId,
      projectPath: remote.projectPath,
    };
  }

  const projectPath = resolveProjectPath(options.project);
  const config = await loadConfig(projectPath);
  return { mode: "local", goals: config.goals, projectPath };
}

export async function setGoals(
  goals: string[],
  options: {
    project?: string;
    workspaceId?: string;
    mirrorLocal?: boolean;
  }
): Promise<{ goals: string[]; mode: "connected" | "local"; workspaceId?: string; projectPath?: string }> {
  const normalized = normalizeGoals(goals);
  const creds = await loadCredentials();

  if (creds) {
    const remote = await updateRemoteGoals(creds, normalized, options.workspaceId);
    const projectPath = options.project ? resolveProjectPath(options.project) : undefined;
    if (projectPath && (options.mirrorLocal !== false)) {
      try {
        await saveLocalGoals(projectPath, normalized);
      } catch {
        // Local project may not be initialized yet; server update still succeeded.
      }
    }
    return {
      mode: "connected",
      goals: remote.config?.goals ?? normalized,
      workspaceId: remote.workspaceId,
      projectPath: remote.projectPath,
    };
  }

  const projectPath = resolveProjectPath(options.project);
  await saveLocalGoals(projectPath, normalized);
  return { mode: "local", goals: normalized, projectPath };
}

export async function addGoals(
  goals: string[],
  options: {
    project?: string;
    workspaceId?: string;
    mirrorLocal?: boolean;
  }
): Promise<{ goals: string[]; mode: "connected" | "local"; workspaceId?: string; projectPath?: string }> {
  const current = await listGoals(options);
  return setGoals([...current.goals, ...goals], options);
}

export async function clearGoals(options: {
  project?: string;
  workspaceId?: string;
  mirrorLocal?: boolean;
}): Promise<{ goals: string[]; mode: "connected" | "local"; workspaceId?: string; projectPath?: string }> {
  return setGoals([], options);
}

export async function requireCredentials(): Promise<CliCredentials> {
  const creds = await loadCredentials();
  if (!creds) {
    throw new Error("Not signed in. Run: runcanon login --server http://127.0.0.1:3000");
  }
  return creds;
}
