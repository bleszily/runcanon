import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { paginate, parsePagination } from "$lib/server/pagination.js";
import { listProposals, resolveSkillPaths } from "$lib/server/registry.js";

export const GET: RequestHandler = async ({ url }) => {
  const paths = await resolveSkillPaths();
  const proposals = await listProposals(paths);
  const { limit, offset } = parsePagination(url);
  return json(paginate(proposals, limit, offset));
};
