import { json } from "@sveltejs/kit";
import { loadConfig } from "@runcanon/core";
import type { RequestHandler } from "./$types";

import { computeGoalAlignmentEnhanced } from "@runcanon/core";

import { readRegistry, resolveSkillPaths } from "$lib/server/registry.js";
import { listEntitledSkillsForDashboard } from "$lib/server/skill-export.js";
import { loadRecentEpisodes } from "$lib/server/trajectories.js";
import { countPendingProposals } from "$lib/server/proposals.js";

export const GET: RequestHandler = async ({ locals }) => {
  const paths = await resolveSkillPaths();
  const [registry, episodes, config, entitledSkills, pendingCount] = await Promise.all([
    readRegistry(paths),
    loadRecentEpisodes(paths.trajectoriesDir),
    loadConfig(paths.projectPath),
    listEntitledSkillsForDashboard(locals.auth),
    countPendingProposals(paths),
  ]);

  const goalAlignment =
    registry.goalAlignment ?? (episodes.length > 0 ? computeGoalAlignmentEnhanced(episodes, config.goals) : 0);

  const activeCount = entitledSkills.filter((s) => s.status === "active").length;

  return json({
    skillCount: activeCount,
    proposalCount: pendingCount,
    retiredCount: entitledSkills.filter((s) => s.status === "retired").length,
    totalCount: entitledSkills.length,
    trajectoryCount: episodes.length,
    goalAlignment,
    generatedAt: registry.generatedAt,
  });
};
