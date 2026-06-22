import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { listProviderModelOptions, type LlmProviderId } from "@runcanon/platform";
import { requireAdmin } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals, params }) => {
  requireAdmin(locals.auth);
  const id = params.id as LlmProviderId;

  try {
    const result = await listProviderModelOptions(id);
    return json(result);
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to list models");
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  requireAdmin(locals.auth);
  const id = params.id as LlmProviderId;

  const body = (await request.json()) as {
    secret?: string;
    baseUrl?: string;
    region?: string;
    projectId?: string;
    location?: string;
  };

  try {
    const result = await listProviderModelOptions(id, body);
    return json(result);
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to list models");
  }
};
