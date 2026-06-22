import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { paginate, parsePagination } from "$lib/server/pagination.js";
import { listEntitledSkillsForDashboard } from "$lib/server/skill-export.js";
import { requireCurator } from "$lib/server/auth.js";
import { createOrgSkillFromMarkdown, newSkillTemplate } from "$lib/server/skill-import.js";

export const GET: RequestHandler = async ({ locals, url }) => {
  const all = await listEntitledSkillsForDashboard(locals.auth);
  const { limit, offset } = parsePagination(url);
  return json(paginate(all, limit, offset));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as { markdown?: string; name?: string; publishToOrg?: boolean };

  const markdown =
    body.markdown?.trim() ||
    (body.name ? newSkillTemplate(body.name) : undefined);
  if (!markdown) throw error(400, "name or markdown is required");

  try {
    const result = await createOrgSkillFromMarkdown({
      auth,
      markdown,
      publishToOrg: body.publishToOrg ?? false,
    });
    return json({ success: true, ...result });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Create failed");
  }
};
