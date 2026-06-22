import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { createCliAuthChallenge } from "@runcanon/platform";

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { redirectUri?: string };
  if (!body.redirectUri) {
    throw error(400, "redirectUri is required");
  }

  try {
    const { state } = await createCliAuthChallenge(body.redirectUri);
    return json({ success: true, state });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Invalid redirect URI");
  }
};
