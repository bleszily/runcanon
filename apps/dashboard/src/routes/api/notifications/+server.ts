import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import { isOrgAdmin, requireAuth } from "$lib/server/auth.js";
import {
  dismissNotifications,
  listDashboardNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
} from "$lib/server/notifications.js";

type PatchAction = "read" | "dismiss" | "read_all";

function parsePatchBody(raw: unknown): { action: PatchAction; ids?: string[] } {
  if (!raw || typeof raw !== "object") throw error(400, "Invalid request body");
  const body = raw as Record<string, unknown>;
  const action = body.action;
  if (action !== "read" && action !== "dismiss" && action !== "read_all") {
    throw error(400, "Invalid action");
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : undefined;
  return { action, ids };
}

export const GET: RequestHandler = async ({ locals }) => {
  const auth = requireAuth(locals.auth);
  const userId = auth.user?.id;
  if (!userId) throw error(401, "Unauthorized");

  const result = await listDashboardNotifications({
    userId,
    isOrgAdmin: isOrgAdmin(auth),
  });

  return json(result);
};

export const PATCH: RequestHandler = async ({ locals, request }) => {
  const auth = requireAuth(locals.auth);
  const userId = auth.user?.id;
  if (!userId) throw error(401, "Unauthorized");

  const body = parsePatchBody(await request.json());

  if (body.action === "read_all") {
    const current = await listDashboardNotifications({
      userId,
      isOrgAdmin: isOrgAdmin(auth),
    });
    await markAllNotificationsRead(
      userId,
      current.notifications.map((n) => n.id)
    );
  } else if (body.action === "read") {
    if (!body.ids?.length) throw error(400, "ids required for read action");
    await markNotificationsRead(userId, body.ids);
  } else if (body.action === "dismiss") {
    if (!body.ids?.length) throw error(400, "ids required for dismiss action");
    await dismissNotifications(userId, body.ids);
  }

  const result = await listDashboardNotifications({
    userId,
    isOrgAdmin: isOrgAdmin(auth),
  });

  return json(result);
};
