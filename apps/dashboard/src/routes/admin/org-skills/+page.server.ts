import { listOrgSkillsForAuth } from "$lib/server/org-skills.js";
import { listSkills, resolveSkillPaths } from "$lib/server/registry.js";
import { readRecentOrgAudit } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isOrgAdmin } from "$lib/server/auth.js";

export const load: PageServerLoad = async ({ locals }) => {
  if (!isOrgAdmin(locals.auth)) {
    throw redirect(303, "/guide");
  }

  const paths = await resolveSkillPaths();
  const [{ active }, orgSkills, audit] = await Promise.all([
    listSkills(paths),
    listOrgSkillsForAuth(locals.auth),
    readRecentOrgAudit(10),
  ]);

  return { workspaceActive: active, orgSkills, audit };
};
