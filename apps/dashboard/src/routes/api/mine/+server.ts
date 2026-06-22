import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { runMining, resolveSkillPaths } from "$lib/server/mining.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth, "approver");
  const paths = await resolveSkillPaths();
  let body: { sources?: string[]; scanProject?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  let result;
  try {
    result = await runMining(paths, body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Mining failed";
    throw error(400, message);
  }

  await appendAudit(paths, {
    action: "mine.run",
    actor: auth.actor,
    resourceType: "mine",
    note: `${result.proposals.length} proposals from ${result.eventCount} events`,
  });

  return json({ success: true, ...result });
};
