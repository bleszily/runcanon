import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { approveProposal, resolveSkillPaths } from "$lib/server/registry.js";

export const POST: RequestHandler = async ({ params, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  const skill = await approveProposal(paths, params.id);

  if (!skill) {
    throw error(404, { message: "Proposal not found" });
  }

  await appendAudit(paths, {
    action: "proposal.approve",
    actor: auth.actor,
    resourceType: "proposal",
    resourceId: params.id,
    note: `Approved skill ${skill.id}`,
  });

  return json({ success: true, skillId: skill.id });
};
