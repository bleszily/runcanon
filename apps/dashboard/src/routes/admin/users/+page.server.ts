import { listAdminUsers } from "@runcanon/platform";
import type { PageServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ locals }) => {
  if (locals.auth.role !== "admin") {
    throw redirect(303, "/guide");
  }
  const users = await listAdminUsers();
  return { users, currentUserId: locals.auth.user?.id ?? null };
};
