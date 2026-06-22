import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  addGroupMember,
  createOrgGroup,
  deleteOrgGroup,
  listOrgGroupsWithMembers,
  listUsers,
  removeGroupMember,
} from "@runcanon/platform";
import { requireAuth, requireCurator } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals.auth);
  const [groups, users] = await Promise.all([listOrgGroupsWithMembers(), listUsers()]);
  return json({ groups, users });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    action?: string;
    name?: string;
    slug?: string;
    description?: string;
    groupId?: string;
    userId?: string;
  };

  if (body.action === "addMember") {
    if (!body.groupId || !body.userId) throw error(400, "groupId and userId are required");
    try {
      const membership = await addGroupMember({
        groupId: body.groupId,
        userId: body.userId,
        actor: auth.actor,
      });
      return json({ success: true, membership });
    } catch (err) {
      throw error(400, err instanceof Error ? err.message : "Failed to add member");
    }
  }

  if (body.action === "removeMember") {
    if (!body.groupId || !body.userId) throw error(400, "groupId and userId are required");
    try {
      await removeGroupMember({ groupId: body.groupId, userId: body.userId, actor: auth.actor });
      return json({ success: true });
    } catch (err) {
      throw error(400, err instanceof Error ? err.message : "Failed to remove member");
    }
  }

  if (!body.name) {
    throw error(400, "name is required");
  }

  try {
    const group = await createOrgGroup({
      name: body.name,
      slug: body.slug,
      description: body.description,
      actor: auth.actor,
    });
    return json({ success: true, group });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to create group");
  }
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
  const auth = requireCurator(locals.auth);
  const groupId = url.searchParams.get("groupId");
  if (!groupId) throw error(400, "groupId query param is required");
  try {
    await deleteOrgGroup(groupId, auth.actor);
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to delete group");
  }
};
