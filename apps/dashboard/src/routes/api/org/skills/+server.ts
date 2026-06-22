import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

import {
  archiveOrgSkill,
  deleteOrgSkill,
  readRecentOrgAudit,
} from "@runcanon/platform";
import { requireAdmin, requireAuth, requireCurator } from "$lib/server/auth.js";
import {
  getOrgSkillForAuth,
  listOrgSkillsForAuth,
  publishWorkspaceSkillToOrg,
} from "$lib/server/org-skills.js";

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals.auth);
  const skills = await listOrgSkillsForAuth(locals.auth);
  const audit = await readRecentOrgAudit(20);
  return json({ skills, audit, total: skills.length });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const auth = requireCurator(locals.auth);
  const body = (await request.json()) as {
    skillId?: string;
    action?: string;
    markdown?: string;
    name?: string;
    publishToOrg?: boolean;
  };

  if (body.action === "create") {
    if (!body.markdown?.trim()) throw error(400, "markdown is required");
    try {
      const { createOrgSkillFromMarkdown, newSkillTemplate } = await import("$lib/server/skill-import.js");
      const markdown = body.markdown.includes("---") ? body.markdown : newSkillTemplate(body.name ?? "New Skill");
      const result = await createOrgSkillFromMarkdown({
        auth,
        markdown,
        publishToOrg: body.publishToOrg ?? true,
      });
      return json({ success: true, ...result });
    } catch (err) {
      throw error(400, err instanceof Error ? err.message : "Create failed");
    }
  }

  if (body.action === "archive") {
    if (!body.skillId) throw error(400, "skillId is required");
    try {
      await archiveOrgSkill(body.skillId, auth.actor);
      return json({ success: true });
    } catch (err) {
      throw error(400, err instanceof Error ? err.message : "Archive failed");
    }
  }

  if (body.action === "delete") {
    if (!body.skillId) throw error(400, "skillId is required");
    const admin = requireAdmin(locals.auth);
    try {
      await deleteOrgSkill(body.skillId, admin.actor);
      return json({ success: true });
    } catch (err) {
      throw error(400, err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!body.skillId) {
    throw error(400, "skillId is required");
  }

  try {
    const result = await publishWorkspaceSkillToOrg({ auth, skillId: body.skillId });
    if ("queued" in result) {
      return json({ success: true, queued: true, promotionId: result.promotionId });
    }
    const detail = await getOrgSkillForAuth(auth, result.id);
    return json({ success: true, record: result, skill: detail?.skill });
  } catch (err) {
    throw error(400, err instanceof Error ? err.message : "Publish failed");
  }
};
