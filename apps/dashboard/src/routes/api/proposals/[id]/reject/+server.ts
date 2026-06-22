import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { rejectProposal, resolveSkillPaths } from "$lib/server/registry.js";

export const POST: RequestHandler = async ({ params, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  const rejected = await rejectProposal(paths, params.id);

  if (!rejected) {
    throw error(404, { message: "Proposal not found" });
  }

  await appendAudit(paths, {
    action: "proposal.reject",
    actor: auth.actor,
    resourceType: "proposal",
    resourceId: params.id,
  });

  return json({ success: true, proposalId: params.id });
};
