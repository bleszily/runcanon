import type { PageServerLoad } from "./$types";
import { toDashboardSkill } from "$lib/server/mappers.js";
import { listEntitledSkillsForDashboard } from "$lib/server/skill-export.js";

export const load: PageServerLoad = async ({ locals }) => {
  const skills = await listEntitledSkillsForDashboard(locals.auth);
  return { skills: skills.map(toDashboardSkill) };
};
