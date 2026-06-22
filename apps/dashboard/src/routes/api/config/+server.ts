import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { loadConfig, parseConfig, saveConfig, DEFAULT_TRAJECTORY_STORAGE } from "@runcanon/core";
import { findWorkspaceById } from "@runcanon/platform";
import { isKnownHarness, type Harness } from "@runcanon/spec";
import { mkdir } from "node:fs/promises";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { resolveSkillPaths, resolveSkillPathsForRoot, type SkillPaths } from "$lib/server/registry.js";

const DEFAULT_HARNESSES: Harness[] = ["claude", "cursor", "copilot", "codex"];

async function ensureWorkspaceLayout(paths: SkillPaths): Promise<void> {
  await mkdir(paths.trajectoriesDir, { recursive: true });
  await mkdir(paths.activeDir, { recursive: true });
  await mkdir(paths.proposedDir, { recursive: true });
  await mkdir(paths.registryProposedDir, { recursive: true });
}

function normalizeGoals(goals: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of goals) {
    const goal = raw.trim();
    if (!goal) continue;
    const key = goal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(goal);
  }
  return normalized;
}

async function resolveConfigTarget(
  locals: App.Locals,
  workspaceId: string | undefined,
  minRole: "viewer" | "approver" = "viewer"
): Promise<{ paths: SkillPaths; auth: ReturnType<typeof requireAuth>; workspaceId?: string }> {
  const auth = requireAuth(locals.auth, minRole);

  if (workspaceId) {
    if (auth.role !== "admin") {
      throw error(403, "Only admins may access another workspace's config");
    }
    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      throw error(404, "Workspace not found");
    }
    return {
      paths: await resolveSkillPathsForRoot(workspace.storagePath),
      auth,
      workspaceId: workspace.id,
    };
  }

  return { paths: await resolveSkillPaths(), auth };
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const workspaceId = url.searchParams.get("workspaceId") ?? undefined;
  const { paths, workspaceId: resolvedWorkspaceId } = await resolveConfigTarget(locals, workspaceId, "viewer");

  try {
    const config = await loadConfig(paths.projectPath);
    return json({
      config,
      projectPath: paths.projectPath,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
    });
  } catch {
    return json({
      config: null,
      projectPath: paths.projectPath,
      initialized: false,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
    });
  }
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json()) as {
    harnesses?: Harness[];
    goals?: string[];
    project?: string;
    workspaceId?: string;
  };

  const { paths, auth, workspaceId } = await resolveConfigTarget(locals, body.workspaceId, "approver");
  await ensureWorkspaceLayout(paths);

  let config;
  try {
    config = await loadConfig(paths.projectPath);
  } catch {
    config = parseConfig({
      project: paths.projectPath.split("/").pop() ?? "workspace",
      scope: ["personal"],
      goals: [],
      harnesses: DEFAULT_HARNESSES,
      autonomy: "ask",
      telemetry: { enabled: true, retentionDays: 90, storagePath: DEFAULT_TRAJECTORY_STORAGE },
      mining: { schedule: "manual", minClusterSize: 2, distanceThreshold: 0.45 },
    });
  }

  const notes: string[] = [];

  if (body.harnesses) {
    const invalid = body.harnesses.filter((h) => !isKnownHarness(h));
    if (invalid.length > 0) {
      throw error(400, `Unsupported harness(es): ${invalid.join(", ")}`);
    }
    config.harnesses = body.harnesses;
    notes.push(`harnesses: ${config.harnesses.join(", ")}`);
  }

  if (body.goals) {
    config.goals = normalizeGoals(body.goals);
    notes.push(`goals: ${config.goals.length} item(s)`);
  }

  if (body.project?.trim()) {
    config.project = body.project.trim();
    notes.push(`project: ${config.project}`);
  }

  await saveConfig(paths.projectPath, config);

  await appendAudit(paths, {
    action: "config.update",
    actor: auth.actor,
    resourceType: "config",
    note: notes.length > 0 ? notes.join("; ") : "config updated",
  });

  return json({
    success: true,
    config,
    projectPath: paths.projectPath,
    ...(workspaceId ? { workspaceId } : {}),
  });
};
