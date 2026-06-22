import { listOrgPromotions } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";
import { isOrgAdmin } from "$lib/server/auth.js";

export const load: PageServerLoad = async ({ locals }) => {
  if (!isOrgAdmin(locals.auth)) {
    throw redirect(303, "/guide");
  }

  const promotions = await listOrgPromotions("pending");
  return { promotions };
};
