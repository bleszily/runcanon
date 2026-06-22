import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { resolveSkillPaths, retireSkill } from "$lib/server/registry.js";

export const POST: RequestHandler = async ({ params, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  const skill = await retireSkill(paths, params.id);

  if (!skill) {
    throw error(404, { message: "Skill not found" });
  }

  await appendAudit(paths, {
    action: "skill.retire",
    actor: auth.actor,
    resourceType: "skill",
    resourceId: params.id,
  });

  return json({ success: true, skill });
};
