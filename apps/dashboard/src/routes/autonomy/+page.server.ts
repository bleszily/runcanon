import type { PageServerLoad } from "./$types";
import { readWorkspaceAutonomy } from "@runcanon/platform";
import { resolveSkillPaths } from "$lib/server/registry.js";

export const load: PageServerLoad = async () => {
  const paths = await resolveSkillPaths();
  const autonomy = await readWorkspaceAutonomy(paths.projectPath);
  return { autonomy };
};
