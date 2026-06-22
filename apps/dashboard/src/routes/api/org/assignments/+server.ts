import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  createSkillAssignment,
  deleteSkillAssignment,
  listOrgSkillRecords,
  listSkillAssignments,
  listUserAssignments,
} from "@runcanon/platform";
import { requireAuth, requireCurator } from "$lib/server/auth.js";

export const GET: RequestHandler = async ({ locals, url }) => {
  const auth = requireAuth(locals.auth);
  const scope = url.searchParams.get("scope");
  const projectPath = url.searchParams.get("projectPath") ?? undefined;

  if (scope === "mine") {
    if (!auth.user) throw error(401, "User required");
    const assignments = await listUserAssignments(auth.user.id, { projectPath });
    return json({ assignments });
  }

  requireCurator(auth);
  const [assignments, skills] = await Promise.all([listSkillAssignments(), listOrgSkillRecords()]);
  return json({ assignments, skills });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    skillId?: string;
    targetType?: "user" | "group";
    targetId?: string;
    mandatory?: boolean;
    expiresAt?: string;
    workspaceId?: string;
    projectSlug?: string;
    skillVersion?: number;
  };

  if (!body.skillId || !body.targetType || !body.targetId) {
    throw error(400, "skillId, targetType, and targetId are required");
  }

  try {
    const assignment = await createSkillAssignment({
      skillId: body.skillId,
      targetType: body.targetType,
      targetId: body.targetId,
      mandatory: body.mandatory,
      expiresAt: body.expiresAt,
      workspaceId: body.workspaceId,
      projectSlug: body.projectSlug,
      skillVersion: body.skillVersion,
      actor: auth.actor,
    });
    return json({ success: true, assignment });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to create assignment");
  }
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
  const auth = requireCurator(locals.auth);
  const assignmentId = url.searchParams.get("assignmentId");
  if (!assignmentId) throw error(400, "assignmentId query param is required");
  try {
    await deleteSkillAssignment(assignmentId, auth.actor);
    return json({ success: true });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Failed to delete assignment");
  }
};
