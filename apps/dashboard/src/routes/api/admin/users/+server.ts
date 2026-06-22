import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  createUser,
  ensureUserWorkspace,
  listAdminUsers,
  requirePasswordReset,
  type UserRole,
} from "@runcanon/platform";
import { requireAdmin } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals }) => {
  requireAdmin(locals.auth);
  const users = await listAdminUsers();
  return json({ users });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  requireAdmin(locals.auth);

  const body = (await request.json()) as {
    email?: string;
    name?: string;
    password?: string;
    role?: UserRole;
    mustResetPassword?: boolean;
  };

  if (!body.email || !body.name || !body.password || !body.role) {
    throw error(400, "Email, name, password, and role are required");
  }
  if (body.password.length < 8) {
    throw error(400, "Password must be at least 8 characters");
  }

  try {
    const user = await createUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role: body.role,
      mustResetPassword: body.mustResetPassword ?? true,
    });
    await ensureUserWorkspace(user.id, user.name, user.email);
    return json({ success: true, user });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to create user");
  }
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  requireAdmin(locals.auth);

  const body = (await request.json()) as {
    userId?: string;
    action?: "requirePasswordReset";
  };

  if (!body.userId || body.action !== "requirePasswordReset") {
    throw error(400, "userId and action are required");
  }

  try {
    await requirePasswordReset(body.userId);
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Update failed");
  }
};
