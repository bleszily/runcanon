import type { PageServerLoad } from "./$types";
import { readRecentAudit } from "$lib/server/audit.js";
import { listAllProposals } from "$lib/server/proposals.js";
import { resolveSkillPaths } from "$lib/server/registry.js";
import { toDashboardProposal } from "$lib/server/mappers.js";

export const load: PageServerLoad = async ({ locals }) => {
  const paths = await resolveSkillPaths();
  const [proposalsRaw, audit] = await Promise.all([listAllProposals(paths), readRecentAudit(paths, 200)]);
  const mapOpts = { actorFallbackEmail: locals.auth.user?.email ?? null };
  return { proposals: proposalsRaw.map((p) => toDashboardProposal(p, p.status, audit, mapOpts)) };
};
