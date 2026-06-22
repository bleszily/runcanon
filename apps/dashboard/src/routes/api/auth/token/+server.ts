import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createApiToken } from "@runcanon/platform";
import { requireAuth } from "$lib/server/auth.js";

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireAuth(locals.auth);
  if (!auth.user) {
    throw error(400, "Sign in with email and password to create CLI tokens");
  }
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const token = await createApiToken(auth.user.id, body.name ?? "CLI");
  return json({ success: true, ...token });
};
