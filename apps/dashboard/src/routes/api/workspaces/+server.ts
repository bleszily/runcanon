import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  createWorkspace,
  ensureUserWorkspace,
  getActiveWorkspaceForUser,
  listWorkspacesForUser,
  setUserActiveWorkspace,
} from "@runcanon/platform";
import { requireAuth, requireAdmin } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals }) => {
  const auth = requireAuth(locals.auth);
  if (!auth.user) {
    throw error(401, "User session required");
  }

  const isAdmin = auth.role === "admin";
  await ensureUserWorkspace(auth.user.id, auth.user.name, auth.user.email);
  const [workspaces, active] = await Promise.all([
    listWorkspacesForUser(auth.user.id, isAdmin),
    getActiveWorkspaceForUser(auth.user.id, isAdmin),
  ]);

  return json({
    workspaces,
    activeWorkspaceId: active?.id,
    isAdmin,
  });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireAdmin(locals.auth);
  if (!auth.user) {
    return json({ error: "User session required" }, { status: 400 });
  }
  const body = (await request.json()) as { name?: string; description?: string; isDefault?: boolean };
  if (!body.name?.trim()) {
    return json({ error: "Workspace name is required" }, { status: 400 });
  }
  const workspace = await createWorkspace({
    name: body.name.trim(),
    description: body.description,
    ownerId: auth.user.id,
    isDefault: body.isDefault,
  });
  return json({ success: true, workspace });
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const auth = requireAuth(locals.auth);
  if (!auth.user) {
    throw error(401, "User session required");
  }

  const body = (await request.json()) as { workspaceId?: string };
  if (!body.workspaceId) {
    throw error(400, "workspaceId is required");
  }

  const workspace = await setUserActiveWorkspace(
    auth.user.id,
    body.workspaceId,
    auth.role === "admin"
  );

  return json({ success: true, workspace });
};
