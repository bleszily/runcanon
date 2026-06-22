import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { recordOrgSync } from "@runcanon/platform";
import { requireAuth } from "$lib/server/auth.js";
import { syncSkillsForAuth } from "$lib/server/org-skills.js";

export const GET: RequestHandler = async ({ locals, url }) => {
  const auth = requireAuth(locals.auth);
  const projectPath = url.searchParams.get("projectPath") ?? undefined;
  const payload = await syncSkillsForAuth(auth, projectPath);
  await recordOrgSync(auth.actor, payload.workspaceSkills.length + payload.orgSkills.length);
  return json({
    ...payload,
    syncedAt: new Date().toISOString(),
  });
};
