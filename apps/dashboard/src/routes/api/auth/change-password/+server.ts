import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { changePassword, findUserById, verifyUserPassword } from "@runcanon/platform";
import { requireAuth } from "$lib/server/auth.js";

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireAuth(locals.auth);
  if (!auth.user) {
    throw error(401, "Unauthorized");
  }

  const body = (await request.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!body.newPassword || body.newPassword.length < 8) {
    throw error(400, "New password must be at least 8 characters");
  }

  const user = await findUserById(auth.user.id);
  if (!user) {
    throw error(404, "User not found");
  }

  const mustReset = user.mustResetPassword ?? false;
  if (!mustReset) {
    if (!body.currentPassword) {
      throw error(400, "Current password is required");
    }
    const valid = await verifyUserPassword(auth.user.id, body.currentPassword);
    if (!valid) {
      throw error(401, "Current password is incorrect");
    }
  }

  await changePassword(auth.user.id, body.newPassword);
  return json({ success: true });
};
