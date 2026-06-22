import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { exchangeCliAuthChallenge } from "@runcanon/platform";

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { state?: string; code?: string };
  if (!body.state || !body.code) {
    throw error(400, "state and code are required");
  }

  try {
    const result = await exchangeCliAuthChallenge(body.state, body.code);
    return json({
      success: true,
      cliToken: { token: result.token, prefix: result.prefix, expiresAt: result.expiresAt },
      user: { email: result.email },
    });
  } catch (err) {
    throw error(401, err instanceof Error ? err.message : "Authorization failed");
  }
};
