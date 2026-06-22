import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createApiToken, createSession, ensureUserWorkspace, verifyUserCredentials } from "@runcanon/platform";

const SESSION_COOKIE = "runcanon_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    createCliToken?: boolean;
  };

  if (!body.email || !body.password) {
    throw error(400, "Email and password are required");
  }

  const user = await verifyUserCredentials(body.email, body.password);
  if (!user) {
    throw error(401, "Invalid email or password");
  }

  await ensureUserWorkspace(user.id, user.name, user.email);

  const session = await createSession(user.id, request.headers.get("user-agent") ?? undefined);
  const isLocalHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  cookies.set(SESSION_COOKIE, session.token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:" && !isLocalHost,
    maxAge: SESSION_MAX_AGE,
  });

  let cliToken: { token: string; prefix: string; expiresAt: string } | undefined;
  if (body.createCliToken) {
    cliToken = await createApiToken(user.id, "CLI login");
  }

  return json({
    success: true,
    user,
    mustResetPassword: user.mustResetPassword,
    cliToken,
  });
};
