import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { approveCliAuthChallenge } from "@runcanon/platform";
import { requireAuth } from "$lib/server/auth.js";

export const POST: RequestHandler = async ({ request, locals }) => {
  const auth = requireAuth(locals.auth);
  if (!auth.user) {
    throw error(401, "Sign in to authorize the CLI");
  }

  const body = (await request.json()) as { state?: string };
  if (!body.state) {
    throw error(400, "state is required");
  }

  try {
    const result = await approveCliAuthChallenge(body.state, auth.user.id);
    return json({ success: true, ...result });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Authorization failed");
  }
};
