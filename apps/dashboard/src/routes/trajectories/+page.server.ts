import { getActiveWorkspaceForUser } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { loadAllEpisodes, loadRecentEpisodes } from "$lib/server/trajectories.js";
import { toDashboardTrajectory } from "$lib/server/mappers.js";
import { buildWorkflowGraph } from "$lib/trajectory-graph.js";

export const load: PageServerLoad = async ({ locals }) => {
  const paths = await resolveSkillPaths();
  const [allEpisodes, tableEpisodes] = await Promise.all([
    loadAllEpisodes(paths.trajectoriesDir),
    loadRecentEpisodes(paths.trajectoriesDir),
  ]);
  const userId = locals.auth.user?.id;
  const activeWorkspace = userId
    ? await getActiveWorkspaceForUser(userId, locals.auth.role === "admin")
    : undefined;
  const workspaceName = activeWorkspace?.name ?? "Workspace";
  const trajectories = allEpisodes.map((e) => toDashboardTrajectory(e, workspaceName));
  const tableRows = tableEpisodes.map((e) => toDashboardTrajectory(e, workspaceName));
  const workflowGraph = buildWorkflowGraph(trajectories);
  return { trajectories: tableRows, workflowGraph, allTrajectories: trajectories };
};
