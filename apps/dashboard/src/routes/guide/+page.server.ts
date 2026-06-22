import { PACKAGE_GUIDE } from "@runcanon/platform";
import { loadConfig } from "@runcanon/core";
import type { PageServerLoad } from "./$types";

import { publicServerUrl } from "$lib/server/public-url.js";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { readReleaseManifest } from "$lib/server/releases.js";

export const load: PageServerLoad = async ({ url, locals }) => {
  const serverUrl = publicServerUrl(url);
  const paths = await resolveSkillPaths();
  let harnesses: string[] = [];
  try {
    const config = await loadConfig(paths.projectPath);
    harnesses = config.harnesses;
  } catch {
    harnesses = ["claude", "cursor", "copilot", "codex"];
  }

  return {
    packages: PACKAGE_GUIDE,
    serverUrl,
    userEmail: locals.auth.user?.email ?? null,
    harnesses,
    release: await readReleaseManifest(),
  };
};
