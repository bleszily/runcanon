import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { runAllWorkspacesPrune } from "$lib/server/cleanup.js";

/** Admin: prune duplicate/noisy skills in every workspace on this instance. */
export const POST: RequestHandler = async ({ locals }) => {
  const auth = requireAuth(locals.auth, "admin");
  const report = await runAllWorkspacesPrune(auth.actor);
  return json({ success: true, ...report });
};
