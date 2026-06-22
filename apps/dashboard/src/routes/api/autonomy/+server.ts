import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { loadConfig, saveConfig } from "@runcanon/core";
import {
  autonomyToSpecLevel,
  readWorkspaceAutonomy,
  writeWorkspaceAutonomy,
  type WorkspaceAutonomy,
} from "@runcanon/platform";

import { resolveSkillPaths } from "$lib/server/registry.js";
import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";

function validateSettings(body: Partial<WorkspaceAutonomy>): WorkspaceAutonomy | null {
  if (
    typeof body.globalEnabled !== "boolean" ||
    typeof body.emergencyStop !== "boolean" ||
    typeof body.undoWindowMinutes !== "number" ||
    !Array.isArray(body.ladders)
  ) {
    return null;
  }
  return {
    globalEnabled: body.globalEnabled,
    emergencyStop: body.emergencyStop,
    undoWindowMinutes: body.undoWindowMinutes,
    ladders: body.ladders,
  };
}

export const GET: RequestHandler = async () => {
  const paths = await resolveSkillPaths();
  const settings = await readWorkspaceAutonomy(paths.projectPath);
  const config = await loadConfig(paths.projectPath);
  return json({ ...settings, specAutonomy: config.autonomy });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  const body = (await request.json()) as Partial<WorkspaceAutonomy>;

  const settings = validateSettings(body);
  if (!settings) {
    throw error(400, {
      message: "Invalid autonomy settings. Expected globalEnabled, emergencyStop, undoWindowMinutes, and ladders.",
    });
  }

  await writeWorkspaceAutonomy(paths.projectPath, settings);

  const config = await loadConfig(paths.projectPath);
  config.autonomy = autonomyToSpecLevel(settings);
  await saveConfig(paths.projectPath, config);

  await appendAudit(paths, {
    action: "config.autonomy",
    actor: auth.actor,
    resourceType: "config",
    note: `global=${settings.globalEnabled}, spec=${config.autonomy}`,
  });

  return json({ ...settings, specAutonomy: config.autonomy });
};
