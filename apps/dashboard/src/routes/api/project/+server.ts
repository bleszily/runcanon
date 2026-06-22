import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { loadConfig, saveConfig, DEFAULT_TRAJECTORY_STORAGE, defaultProjectDataDir } from "@runcanon/core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import {
  readProjectPathState,
  resolveActiveProjectPath,
  validateProjectPath,
  writeProjectPathState,
} from "$lib/server/project-path.js";
import { resolveSkillPaths } from "$lib/server/registry.js";

export const GET: RequestHandler = async () => {
  const [projectPath, state] = await Promise.all([resolveActiveProjectPath(), readProjectPathState()]);
  const paths = await resolveSkillPaths(projectPath);
  let initialized = false;
  try {
    await loadConfig(projectPath);
    initialized = true;
  } catch {
    initialized = false;
  }

  return json({
    projectPath,
    miningSources: state?.miningSources ?? [],
    initialized,
    configPath: paths.configPath,
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const body = (await request.json()) as {
    projectPath?: string;
    miningSources?: string[];
    llm?: {
      provider: "anthropic" | "openai" | "ollama" | "generic";
      model: string;
      baseUrl?: string;
      maxTokens?: number;
      temperature?: number;
    };
  };

  if (!body.projectPath) {
    throw error(400, "projectPath is required");
  }

  const validation = await validateProjectPath(body.projectPath);
  if (!validation.ok) {
    throw error(400, validation.error);
  }

  const resolved = await resolveActiveProjectPath(body.projectPath);
  await writeProjectPathState({
    projectPath: resolved,
    miningSources: body.miningSources,
  });

  const paths = await resolveSkillPaths(resolved);

  try {
    await loadConfig(resolved);
  } catch {
    const dataDir = defaultProjectDataDir(resolved);
    await mkdir(join(dataDir, "skills", "active"), { recursive: true });
    await mkdir(join(dataDir, "skills", "proposed"), { recursive: true });
    await mkdir(join(dataDir, "trajectories"), { recursive: true });
    await mkdir(join(dataDir, "registry", "proposed"), { recursive: true });

    await saveConfig(resolved, {
      project: resolved.split("/").pop() ?? "project",
      scope: ["workspace-wide"],
      goals: [],
      harnesses: ["claude", "cursor", "copilot"],
      autonomy: "ask",
      telemetry: {
        enabled: true,
        retentionDays: 90,
        storagePath: DEFAULT_TRAJECTORY_STORAGE,
      },
      mining: {
        schedule: "manual",
        minClusterSize: 2,
        distanceThreshold: 0.45,
      },
      ...(body.llm ? { llm: body.llm } : {}),
    });
  }

  if (body.llm) {
    const config = await loadConfig(resolved);
    await saveConfig(resolved, { ...config, llm: body.llm });
  }

  await appendAudit(paths, {
    action: "project.set",
    actor: auth.actor,
    resourceType: "project",
    note: resolved,
  });

  return json({ success: true, projectPath: resolved, miningSources: body.miningSources ?? [] });
};
