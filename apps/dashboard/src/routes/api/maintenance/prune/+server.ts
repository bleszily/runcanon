import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { runWorkspacePrune } from "$lib/server/cleanup.js";

/** Remove duplicate/noisy proposals and normalize workspace skill records. */
export const POST: RequestHandler = async ({ locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const report = await runWorkspacePrune(auth.actor);
  return json({ success: true, ...report });
};
