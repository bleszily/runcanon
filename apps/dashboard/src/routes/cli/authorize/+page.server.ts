import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getCliAuthChallenge } from "@runcanon/platform";
import { redirectToLogin } from "$lib/server/auth.js";

export const load: PageServerLoad = async ({ url, locals }) => {
  const state = url.searchParams.get("state");
  if (!state) {
    throw error(400, "Missing authorization state");
  }

  const challenge = await getCliAuthChallenge(state);
  if (!challenge) {
    throw error(400, "Invalid or expired authorization request. Run runcanon login again.");
  }

  if (!locals.auth.authenticated || !locals.auth.user) {
    redirectToLogin(`/cli/authorize?state=${encodeURIComponent(state)}`);
  }

  return {
    state,
    userEmail: locals.auth.user.email,
  };
};
