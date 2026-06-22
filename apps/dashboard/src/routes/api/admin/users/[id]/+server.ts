import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { deleteUser, updateUserName, updateUserRole, type UserRole } from "@runcanon/platform";
import { requireAdmin } from "$lib/server/auth.js";

export const PATCH: RequestHandler = async ({ locals, request, params }) => {
  requireAdmin(locals.auth);

  const body = (await request.json()) as {
    name?: string;
    role?: UserRole;
  };

  try {
    if (body.role) {
      const user = await updateUserRole(params.id, body.role);
      return json({ success: true, user });
    }
    if (body.name) {
      const user = await updateUserName(params.id, body.name);
      return json({ success: true, user });
    }
    throw error(400, "No updates provided");
  } catch (err) {
    if (err && typeof err === "object" && "status" in err) throw err;
    throw error(400, err instanceof Error ? err.message : "Update failed");
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const auth = requireAdmin(locals.auth);
  if (!auth.user) {
    throw error(401, "Unauthorized");
  }

  try {
    await deleteUser(params.id, auth.user.id);
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Delete failed");
  }
};
