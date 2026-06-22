import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { revokeSession } from "@runcanon/platform";

const SESSION_COOKIE = "runcanon_session";

export const POST: RequestHandler = async ({ cookies, locals }) => {
  const token = cookies.get(SESSION_COOKIE);
  if (token) {
    await revokeSession(token);
  }
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return json({ success: true, user: locals.auth.user ?? null });
};
