import { loadConfig } from "@runcanon/core";
import { getActiveWorkspaceForUser } from "@runcanon/platform";
import type { LayoutServerLoad } from "./$types";

import { readRecentAudit } from "$lib/server/audit.js";
import { isOrgAdmin } from "$lib/server/auth.js";
import { countPendingProposals } from "$lib/server/proposals.js";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { SPEC_TO_DASH } from "$lib/autonomy.js";

export const load: LayoutServerLoad = async ({ locals }) => {
  const paths = await resolveSkillPaths();
  const isAdmin = locals.auth.role === "admin";
  const orgAdmin = isOrgAdmin(locals.auth);
  const userId = locals.auth.user?.id;
  const activeWorkspace = userId
    ? await getActiveWorkspaceForUser(userId, isAdmin)
    : undefined;

  let projectName = activeWorkspace?.name ?? "Workspace";
  let autonomy = "ask";
  let autonomyLabel = "Ask me";

  try {
    const config = await loadConfig(paths.projectPath);
    projectName = activeWorkspace?.name ?? config.project ?? projectName;
    autonomy = config.autonomy;
    autonomyLabel = SPEC_TO_DASH[config.autonomy] ?? "ask";
  } catch {
    // Project may not be initialized yet.
  }

  const [pendingProposals, audit] = await Promise.all([
    countPendingProposals(paths),
    readRecentAudit(paths, 5),
  ]);

  return {
    layout: {
      projectPath: paths.projectPath,
      projectName,
      workspaceName: activeWorkspace?.name,
      workspaceId: activeWorkspace?.id,
      autonomy,
      autonomyLabel,
      pendingProposals,
      recentAudit: audit,
      user: locals.auth.user ?? null,
      isAdmin,
      isOrgAdmin: orgAdmin,
      actor: locals.auth.actor,
    },
  };
};
