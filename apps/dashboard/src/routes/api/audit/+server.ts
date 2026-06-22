import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { readRecentAudit } from "$lib/server/audit.js";
import { resolveSkillPaths } from "$lib/server/registry.js";

export const GET: RequestHandler = async ({ url }) => {
  const paths = await resolveSkillPaths();
  const limit = Math.min(100, Number(url.searchParams.get("limit") ?? 50) || 50);
  const entries = await readRecentAudit(paths, limit);
  return json({ entries });
};
