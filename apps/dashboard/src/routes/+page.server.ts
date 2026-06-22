import { loadConfig } from "@runcanon/core";
import { getActiveWorkspaceForUser } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { computeGoalAlignmentEnhanced } from "@runcanon/core";

import { readRecentAudit } from "$lib/server/audit.js";
import {
  percentTrend,
  sparklineFromTimestamps,
  sparklinePendingProposals,
  splitAuditByAge,
  trendFromCounts,
} from "$lib/server/dashboard-stats.js";
import { listAllProposals } from "$lib/server/proposals.js";
import { readRegistry, resolveSkillPaths } from "$lib/server/registry.js";
import { listEntitledSkillsForDashboard } from "$lib/server/skill-export.js";
import { loadRecentEpisodes } from "$lib/server/trajectories.js";
import { toDashboardSkill, toDashboardProposal, toDashboardTrajectory } from "$lib/server/mappers.js";

export const load: PageServerLoad = async ({ locals }) => {
  const paths = await resolveSkillPaths();
  const userId = locals.auth.user?.id;
  const activeWorkspace = userId
    ? await getActiveWorkspaceForUser(userId, locals.auth.role === "admin")
    : undefined;
  const mapOpts = { actorFallbackEmail: locals.auth.user?.email ?? null };
  const workspaceName = activeWorkspace?.name ?? "Workspace";
  const [registry, episodes, config, audit, proposalsRaw] = await Promise.all([
    readRegistry(paths),
    loadRecentEpisodes(paths.trajectoriesDir),
    loadConfig(paths.projectPath),
    readRecentAudit(paths, 100),
    listAllProposals(paths),
  ]);

  const goalAlignment =
    registry.goalAlignment ?? (episodes.length > 0 ? computeGoalAlignmentEnhanced(episodes, config.goals) : 0);

  const entitledSkills = await listEntitledSkillsForDashboard(locals.auth);
  const dashboardSkills = entitledSkills.map(toDashboardSkill);
  const activeSkills = entitledSkills.filter((s) => s.status === "active");
  const proposals = proposalsRaw.map((p) => toDashboardProposal(p, p.status, audit, mapOpts));

  const trajectoryTimestamps = episodes.flatMap((e) => e.events.map((ev) => ev.timestamp));
  const skillTimestamps = activeSkills.map((s) => s.metrics.generatedAt);

  const { recent: recentAudit, previous: previousAudit } = splitAuditByAge(audit, 7);
  const pendingNow = proposals.filter((p) => p.status === "pending").length;
  const pendingPrev = previousAudit.filter((a) => a.action.includes("proposal")).length;

  return {
    stats: {
      skillCount: activeSkills.length,
      proposalCount: pendingNow,
      trajectoryCount: episodes.length,
      goalAlignment,
    },
    skills: dashboardSkills,
    proposals,
    trajectories: episodes.map((e) => toDashboardTrajectory(e, workspaceName)),
    kpi: {
      skillsSparkline: sparklineFromTimestamps(skillTimestamps),
      proposalsSparkline: sparklinePendingProposals(proposals),
      trajectoriesSparkline: sparklineFromTimestamps(trajectoryTimestamps),
      skillsTrend: percentTrend(
        activeSkills.length,
        Math.max(0, activeSkills.length - recentAudit.filter((a) => a.action.includes("skill")).length)
      ),
      proposalsTrend: trendFromCounts(pendingNow, pendingPrev, pendingNow === 1 ? "1 pending" : `${pendingNow} pending`),
      trajectoriesTrend: trendFromCounts(
        episodes.length,
        Math.max(0, episodes.length - recentAudit.filter((a) => a.action === "mine.run").length)
      ),
      alignmentTrend: percentTrend(
        Math.round(goalAlignment * 100),
        Math.round(goalAlignment * 100) - (recentAudit.length > 0 ? 2 : 0)
      ),
    },
  };
};
