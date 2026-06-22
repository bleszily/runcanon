import { listOrgSkillRecords, listSkillAssignments, listUsers, listOrgGroupsWithMembers } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isOrgAdmin } from "$lib/server/auth.js";
import { listSkills, resolveSkillPaths } from "$lib/server/registry.js";

export const load: PageServerLoad = async ({ locals }) => {
  if (!isOrgAdmin(locals.auth)) {
    throw redirect(303, "/guide");
  }

  const paths = await resolveSkillPaths();
  const [{ active: workspaceActive }, assignments, skills, users, groups] = await Promise.all([
    listSkills(paths),
    listSkillAssignments(),
    listOrgSkillRecords(),
    listUsers(),
    listOrgGroupsWithMembers(),
  ]);

  const publishedIds = new Set(skills.map((s) => s.id));
  const unpublishedWorkspace = workspaceActive.filter((s) => !publishedIds.has(s.id));

  return { assignments, skills, users, groups, workspaceActive, unpublishedWorkspace };
};
