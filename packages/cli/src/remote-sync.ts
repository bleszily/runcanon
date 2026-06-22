import type { Skill, SkillProposal } from "@runcanon/spec";
import { collectEventsFromSources, filterClusteringEvents } from "@runcanon/core";

import { assertClusteringSources, printCollectionSummary } from "./collection.js";
import { apiRequest, loadCredentials, LONG_RUNNING_API_TIMEOUT_MS, type CliCredentials } from "./remote.js";

export async function getRemoteCredentials(): Promise<CliCredentials | undefined> {
  return loadCredentials();
}

export async function syncHarnessConfig(
  creds: CliCredentials,
  harnesses: string[] = ["claude", "cursor", "copilot", "codex"]
): Promise<void> {
  const res = await apiRequest(creds, "PATCH", "/api/config", { harnesses });
  if (!res.ok) {
    throw new Error(`Failed to configure workspace (${res.status}): ${await res.text()}`);
  }
}

export interface RemoteConfigResponse {
  config: { goals: string[]; harnesses?: string[]; project?: string } | null;
  projectPath: string;
  workspaceId?: string;
  initialized?: boolean;
}

function configQuery(workspaceId?: string): string {
  return workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
}

/** Fetch workspace config from the connected dashboard (active workspace, or admin override). */
export async function fetchRemoteConfig(
  creds: CliCredentials,
  workspaceId?: string
): Promise<RemoteConfigResponse> {
  const res = await apiRequest(creds, "GET", `/api/config${configQuery(workspaceId)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch config (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RemoteConfigResponse;
}

/** Update workspace goals on the connected dashboard. */
export async function updateRemoteGoals(
  creds: CliCredentials,
  goals: string[],
  workspaceId?: string
): Promise<RemoteConfigResponse & { success: boolean }> {
  const res = await apiRequest(creds, "PATCH", "/api/config", { goals, workspaceId });
  if (!res.ok) {
    throw new Error(`Failed to update goals (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as RemoteConfigResponse & { success: boolean };
}

export async function uploadTrajectories(
  creds: CliCredentials,
  content: string,
  filename?: string
): Promise<{ eventCount: number; filename: string }> {
  const res = await apiRequest(creds, "POST", "/api/trajectories", {
    filename: filename ?? `cli-${Date.now()}.jsonl`,
    content,
  });
  if (!res.ok) {
    throw new Error(`Failed to upload trajectories (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { eventCount: number; filename: string };
  return body;
}

export async function runRemoteMine(creds: CliCredentials): Promise<{
  proposals: SkillProposal[];
  eventCount: number;
  filesRead: string[];
  llmUsed: boolean;
}> {
  const res = await apiRequest(creds, "POST", "/api/mine", { scanProject: true }, {
    timeoutMs: LONG_RUNNING_API_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`Remote mining failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as {
    proposals: SkillProposal[];
    eventCount: number;
    filesRead: string[];
    llmUsed: boolean;
  };
}

export async function runRemoteExport(
  creds: CliCredentials,
  harness: string
): Promise<{ skillCount: number; filesWritten: number; paths: string[] }> {
  const res = await apiRequest(creds, "POST", "/api/export", { harness });
  if (!res.ok) {
    throw new Error(`Remote export failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as { skillCount: number; filesWritten: number; paths: string[] };
}

/** Sync entitled org + workspace skills from connected dashboard. */
export async function fetchRemoteSyncPayload(creds: CliCredentials): Promise<{
  workspaceSkills: Skill[];
  orgSkills: Skill[];
  mandatoryOrgSkillIds: string[];
}> {
  const res = await apiRequest(creds, "GET", "/api/org/sync");
  if (!res.ok) {
    throw new Error(`Sync failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as {
    workspaceSkills: Skill[];
    orgSkills: Skill[];
    mandatoryOrgSkillIds: string[];
  };
}

/** Import skills from a GitHub/Bitbucket repo via the dashboard (curator+). */
export async function runRemoteGitImport(
  creds: CliCredentials,
  input: {
    repoUrl: string;
    branch?: string;
    token?: string;
    destination?: "workspace" | "org" | "proposal";
    enrich?: boolean;
  }
): Promise<{ imported: Array<{ skillId: string; name: string }>; skipped: Array<{ path: string; reason: string }>; llmUsed: boolean }> {
  const res = await apiRequest(creds, "POST", "/api/org/skills/import", input, {
    timeoutMs: LONG_RUNNING_API_TIMEOUT_MS,
  });
  if (!res.ok) {
    throw new Error(`Git import failed (${res.status}): ${await res.text()}`);
  }
  return (await res.json()) as {
    imported: Array<{ skillId: string; name: string }>;
    skipped: Array<{ path: string; reason: string }>;
    llmUsed: boolean;
  };
}

/** Fetch a single skill from workspace or org library on the server. */
export async function fetchRemoteSkillById(creds: CliCredentials, skillId: string): Promise<Skill | undefined> {
  const workspaceRes = await apiRequest(creds, "GET", `/api/skills/${encodeURIComponent(skillId)}`);
  if (workspaceRes.ok) {
    const body = (await workspaceRes.json()) as { skill: Skill };
    return body.skill;
  }
  const orgRes = await apiRequest(creds, "GET", `/api/org/skills/${encodeURIComponent(skillId)}`);
  if (orgRes.ok) {
    const body = (await orgRes.json()) as { skill: Skill };
    return body.skill;
  }
  return undefined;
}

/** Fetch approved (active) skills from the connected dashboard workspace. */
export async function fetchRemoteActiveSkills(creds: CliCredentials): Promise<Skill[]> {
  const res = await apiRequest(creds, "GET", "/api/skills?limit=100");
  if (!res.ok) {
    throw new Error(`Failed to fetch skills (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { items: Skill[] };
  return body.items.filter((skill) => skill.status === "active");
}

/** Collect local trajectory events and mine on the connected dashboard workspace. */
export async function mineOnServer(input: {
  projectPath: string;
  sources?: string[];
}): Promise<{ creds: CliCredentials; result: Awaited<ReturnType<typeof runRemoteMine>>; uploadedEvents: number }> {
  const creds = await loadCredentials();
  if (!creds) {
    throw new Error("Not signed in. Run: runcanon login --server http://127.0.0.1:3000");
  }

  const sourcePaths = input.sources ?? [];
  const collected = await collectEventsFromSources(input.projectPath, {
    sources: sourcePaths,
    scanProject: sourcePaths.length === 0,
  });

  printCollectionSummary(collected.summary);
  assertClusteringSources(collected.summary, collected.events);

  const clusteringEvents = filterClusteringEvents(collected.events);
  const content = `${clusteringEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
  const upload = await uploadTrajectories(creds, content, `cli-mine-${Date.now()}.jsonl`);
  console.log(`Mining on ${creds.server} (this may take several minutes with LLM ranking)…`);
  const result = await runRemoteMine(creds);

  return { creds, result, uploadedEvents: upload.eventCount };
}
