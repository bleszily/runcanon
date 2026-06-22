import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { getOrgMetrics, readRecentOrgAudit } from "@runcanon/platform";
import { requireAuth, requireCurator } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals.auth);
  requireCurator(locals.auth);
  const [metrics, audit] = await Promise.all([getOrgMetrics(), readRecentOrgAudit(50)]);
  return json({ metrics, audit });
};
