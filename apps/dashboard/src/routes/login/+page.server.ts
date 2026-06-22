import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { authRequired } from "$lib/server/auth.js";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.auth.authenticated && authRequired()) {
    throw redirect(303, "/guide");
  }
  return {};
};
