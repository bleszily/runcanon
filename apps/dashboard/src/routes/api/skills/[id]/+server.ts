import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth, requireCurator } from "$lib/server/auth.js";
import { findSkillById, resolveSkillPaths } from "$lib/server/registry.js";
import { updateWorkspaceSkillMarkdown } from "$lib/server/skill-import.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireAuth(locals.auth);
  const paths = await resolveSkillPaths();

  if (url.searchParams.get("format") === "markdown") {
    for (const dir of [paths.activeDir, paths.proposedDir, paths.retiredDir]) {
      try {
        const markdown = await readFile(join(dir, `${params.id}.md`), "utf-8");
        return json({ markdown });
      } catch {
        continue;
      }
    }
    throw error(404, "Skill not found");
  }

  const skill = await findSkillById(paths, params.id);
  if (!skill) {
    throw error(404, "Skill not found");
  }
  return json({ skill });
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as { markdown?: string; syncOrg?: boolean };
  if (!body.markdown?.trim()) throw error(400, "markdown is required");

  try {
    const skill = await updateWorkspaceSkillMarkdown({
      auth,
      skillId: params.id,
      markdown: body.markdown,
      syncOrg: body.syncOrg,
    });
    return json({ success: true, skill });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Update failed");
  }
};
