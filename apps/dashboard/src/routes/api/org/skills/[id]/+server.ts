import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { readOrgSkillMarkdown, deleteOrgSkill } from "@runcanon/platform";
import { requireAdmin, requireAuth, requireCurator } from "$lib/server/auth.js";
import { getOrgSkillForAuth } from "$lib/server/org-skills.js";
import { updateOrgSkillMarkdown } from "$lib/server/skill-import.js";

export const GET: RequestHandler = async ({ params, locals, url }) => {
  requireAuth(locals.auth);

  if (url.searchParams.get("format") === "markdown") {
    requireCurator(locals.auth);
    const markdown = await readOrgSkillMarkdown(params.id);
    if (!markdown) throw error(404, "Org skill not found");
    return json({ markdown });
  }

  const detail = await getOrgSkillForAuth(locals.auth, params.id);
  if (!detail) {
    throw error(404, "Org skill not found or not entitled");
  }
  return json(detail);
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as { markdown?: string };
  if (!body.markdown?.trim()) throw error(400, "markdown is required");

  try {
    await updateOrgSkillMarkdown({ auth, skillId: params.id, markdown: body.markdown });
    const detail = await getOrgSkillForAuth(auth, params.id);
    return json({ success: true, skill: detail?.skill });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Update failed");
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const auth = requireAdmin(locals.auth);
  try {
    await deleteOrgSkill(params.id, auth.actor);
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Delete failed");
  }
};
