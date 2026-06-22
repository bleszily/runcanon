import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { requireAuth } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals }) => {
  const auth = requireAuth(locals.auth);
  return json({
    user: auth.user ?? { email: auth.actor, name: auth.actor, role: auth.role, id: "legacy" },
    role: auth.role,
    actor: auth.actor,
  });
};
