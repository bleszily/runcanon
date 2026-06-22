import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { listProviders, upsertProvider, type LlmProviderId } from "@runcanon/platform";
import { requireAdmin } from "$lib/server/auth.js";
import { appendAudit } from "$lib/server/audit.js";
import { resolveSkillPaths } from "$lib/server/registry.js";

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals.auth);
  const providers = await listProviders();
  return json({ providers });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireAdmin(locals.auth);
  const body = (await request.json()) as {
    id: LlmProviderId;
    enabled: boolean;
    model: string;
    baseUrl?: string;
    secret?: string;
  };

  if (!body.id) {
    throw error(400, "Provider id is required");
  }

  const provider = await upsertProvider(body.id, {
    enabled: body.enabled,
    model: body.model,
    baseUrl: body.baseUrl,
    secret: body.secret,
    updatedBy: auth.user?.email ?? auth.actor,
  });

  const paths = await resolveSkillPaths();
  await appendAudit(paths, {
    action: "admin.provider.update",
    actor: auth.actor,
    resourceType: "provider",
    resourceId: body.id,
    note: `${body.id} enabled=${body.enabled}`,
  });

  return json({ success: true, provider });
};
