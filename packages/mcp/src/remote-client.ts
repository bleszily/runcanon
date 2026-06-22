import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { DEFAULT_SYNC_HARNESSES, USER_CONFIG_DIR, writeSkillsToProject } from "@runcanon/core";
import type { Harness, Skill } from "@runcanon/spec";

export interface RemoteCredentials {
  server: string;
  token: string;
  email?: string;
  prefix?: string;
  savedAt: string;
}

function credentialsPath(): string {
  const dir = process.env.RUNCANON_CONFIG_DIR ?? join(homedir(), USER_CONFIG_DIR);
  return join(dir, "credentials.json");
}

export async function loadRemoteCredentials(): Promise<RemoteCredentials | undefined> {
  try {
    const raw = await readFile(credentialsPath(), "utf-8");
    const parsed = JSON.parse(raw) as RemoteCredentials;
    if (!parsed.server || !parsed.token) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export async function isConnectedMode(): Promise<boolean> {
  const creds = await loadRemoteCredentials();
  if (!creds) return false;
  try {
    const res = await fetch(`${creds.server.replace(/\/$/, "")}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function remoteApiRequest(
  creds: RemoteCredentials,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${creds.server.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function fetchRemoteSkill(skillId: string): Promise<Skill | undefined> {
  const creds = await loadRemoteCredentials();
  if (!creds) return undefined;

  const workspaceRes = await remoteApiRequest(creds, "GET", `/api/skills/${encodeURIComponent(skillId)}`);
  if (workspaceRes.ok) {
    const body = (await workspaceRes.json()) as { skill: Skill };
    return body.skill;
  }

  const orgRes = await remoteApiRequest(creds, "GET", `/api/org/skills/${encodeURIComponent(skillId)}`);
  if (orgRes.ok) {
    const body = (await orgRes.json()) as { skill: Skill };
    return body.skill;
  }

  return undefined;
}

export async function fetchRemoteSkillsList(): Promise<{ active: Skill[]; proposed: Skill[]; org: Skill[] }> {
  const creds = await loadRemoteCredentials();
  if (!creds) {
    return { active: [], proposed: [], org: [] };
  }

  const [skillsRes, orgRes] = await Promise.all([
    remoteApiRequest(creds, "GET", "/api/skills?limit=200"),
    remoteApiRequest(creds, "GET", "/api/org/skills"),
  ]);

  let active: Skill[] = [];
  let proposed: Skill[] = [];
  if (skillsRes.ok) {
    const body = (await skillsRes.json()) as { items: Skill[] };
    active = body.items.filter((s) => s.status === "active");
    proposed = body.items.filter((s) => s.status === "proposed" || s.status === "draft");
  }

  let org: Skill[] = [];
  if (orgRes.ok) {
    const body = (await orgRes.json()) as { skills: Array<{ skill?: Skill }> };
    org = body.skills.map((s) => s.skill).filter((s): s is Skill => Boolean(s));
  }

  return { active, proposed, org };
}

export async function fetchRemoteSync(projectPath?: string): Promise<{
  workspaceSkills: Skill[];
  orgSkills: Skill[];
  mandatoryOrgSkillIds: string[];
  missingMandatory: string[];
}> {
  const creds = await loadRemoteCredentials();
  if (!creds) {
    return { workspaceSkills: [], orgSkills: [], mandatoryOrgSkillIds: [], missingMandatory: [] };
  }

  const query = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : "";
  const res = await remoteApiRequest(creds, "GET", `/api/org/sync${query}`);
  if (!res.ok) {
    throw new Error(`Sync failed (${res.status}): ${await res.text()}`);
  }

  return (await res.json()) as {
    workspaceSkills: Skill[];
    orgSkills: Skill[];
    mandatoryOrgSkillIds: string[];
    missingMandatory: string[];
  };
}

export interface RemoteConfigResponse {
  config: { goals: string[] } | null;
  projectPath: string;
  workspaceId?: string;
  initialized?: boolean;
}

function configQuery(workspaceId?: string): string {
  return workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
}

export function normalizeRemoteGoals(input: string[]): string[] {
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

export async function fetchRemoteConfig(workspaceId?: string): Promise<RemoteConfigResponse> {
  const creds = await loadRemoteCredentials();
  if (!creds) {
    throw new Error("Not connected. Run: runcanon login --server http://127.0.0.1:3000");
  }
  const res = await remoteApiRequest(creds, "GET", `/api/config${configQuery(workspaceId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch config (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RemoteConfigResponse;
}

export async function updateRemoteGoals(
  goals: string[],
  options?: { workspaceId?: string; mirrorLocalProjectPath?: string }
): Promise<RemoteConfigResponse & { success: boolean }> {
  const creds = await loadRemoteCredentials();
  if (!creds) {
    throw new Error("Not connected. Run: runcanon login --server http://127.0.0.1:3000");
  }
  const normalized = normalizeRemoteGoals(goals);
  const res = await remoteApiRequest(creds, "PATCH", "/api/config", {
    goals: normalized,
    workspaceId: options?.workspaceId,
  });
  if (!res.ok) {
    throw new Error(`Failed to update goals (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as RemoteConfigResponse & { success: boolean };

  if (options?.mirrorLocalProjectPath) {
    try {
      const { loadConfig, saveConfig } = await import("@runcanon/core");
      const localPath = resolveProjectRoot(options.mirrorLocalProjectPath);
      const config = await loadConfig(localPath);
      config.goals = normalized;
      await saveConfig(localPath, config);
    } catch {
      // Local mirror is best-effort when connected.
    }
  }

  return body;
}

export async function fetchRemoteAssignments(projectPath?: string): Promise<
  Array<{ id: string; skillId: string; mandatory: boolean; targetType: string; targetId: string }>
> {
  const creds = await loadRemoteCredentials();
  if (!creds) return [];

  const query = projectPath ? `?scope=mine&projectPath=${encodeURIComponent(projectPath)}` : "?scope=mine";
  const res = await remoteApiRequest(creds, "GET", `/api/org/assignments${query}`);
  if (!res.ok) {
    throw new Error(`Assignments failed (${res.status}): ${await res.text()}`);
  }

  const body = (await res.json()) as {
    assignments: Array<{ id: string; skillId: string; mandatory: boolean; targetType: string; targetId: string }>;
  };
  return body.assignments;
}

export interface WriteSkillsOptions {
  harnesses?: Harness[];
  prune?: boolean;
}

/** Write skills to all harness-native paths (Cursor, Claude, Codex, Antigravity, Copilot, …). */
export async function writeSkillsToProjectHarnesses(
  projectPath: string,
  skills: Skill[],
  options?: WriteSkillsOptions
): Promise<{ paths: string[]; pruned: string[]; harnesses: string[] }> {
  const harnesses = options?.harnesses ?? DEFAULT_SYNC_HARNESSES;
  const prepared = skills.map((skill) => ({
    ...skill,
    harnesses: skill.harnesses?.length ? skill.harnesses : harnesses,
  }));

  const result = await writeSkillsToProject({
    projectRoot: projectPath,
    skills: prepared,
    harnesses,
    overwrite: true,
    prune: options?.prune ?? true,
    includeProjectInstructions: true,
  });

  return { paths: result.paths, pruned: result.pruned, harnesses: result.harnesses };
}

/** @deprecated Use writeSkillsToProjectHarnesses — kept for backward compatibility. */
export async function writeSkillsToCursorDir(
  projectPath: string,
  skills: Skill[],
  _subdir = ".cursor/skills"
): Promise<string[]> {
  const result = await writeSkillsToProjectHarnesses(projectPath, skills, {
    harnesses: ["cursor"],
    prune: false,
  });
  return result.paths;
}

export function resolveProjectRoot(projectPath?: string): string {
  return resolve(projectPath ?? process.env.RUNCANON_PROJECT_PATH ?? process.cwd());
}
