import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { testActiveLlmConnection, testProviderConnection, type LlmProviderId } from "@runcanon/platform";
import { requireAdmin } from "$lib/server/auth.js";

export const POST: RequestHandler = async ({ locals, request }) => {
  requireAdmin(locals.auth);

  let body: {
    id?: LlmProviderId;
    model?: string;
    baseUrl?: string;
    secret?: string;
    region?: string;
    projectId?: string;
    location?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    // empty body tests active saved provider
  }

  if (body.id) {
    const result = await testProviderConnection(body.id, body);
    return json(result);
  }

  const result = await testActiveLlmConnection();
  return json(result);
};
