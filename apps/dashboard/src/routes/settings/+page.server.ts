import { loadConfig, RUNCANON_VERSION } from "@runcanon/core";
import {
  getActiveWorkspaceForUser,
  listWorkspacesForUser,
  resolveActiveLlmConfig,
} from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { readRecentAudit } from "$lib/server/audit.js";
import { publicServerUrl } from "$lib/server/public-url.js";

export const load: PageServerLoad = async ({ locals, url }) => {
  const paths = await resolveSkillPaths();
  const isAdmin = locals.auth.role === "admin";
  const userId = locals.auth.user?.id;

  let config = null;
  try {
    config = await loadConfig(paths.projectPath);
  } catch {
    config = null;
  }

  const [audit, workspaces, workspace, llmConfig] = await Promise.all([
    readRecentAudit(paths, 10),
    userId ? listWorkspacesForUser(userId, isAdmin) : Promise.resolve([]),
    userId ? getActiveWorkspaceForUser(userId, isAdmin) : Promise.resolve(undefined),
    resolveActiveLlmConfig(),
  ]);

  return {
    version: RUNCANON_VERSION,
    serverUrl: publicServerUrl(url),
    workspace,
    activeWorkspaceId: workspace?.id,
    workspaces,
    projectPath: paths.projectPath,
    config,
    audit,
    authEnabled: true,
    isAdmin,
    llmConfigured: Boolean(llmConfig),
    llmProvider: llmConfig?.provider,
    llmModel: llmConfig?.model,
  };
};
