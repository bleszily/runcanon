import { parseSkill, serializeSkill, type Skill } from "@runcanon/spec";
import {
  getActiveWorkspaceForUser,
  getOrgSkillRecord,
  listOrgSkillRecords,
  listUserAssignments,
  publishOrgSkill,
  readOrgSkillMarkdown,
  resolveAllOrgSkillIds,
  resolveUserOrgSkillIds,
  submitOrgPromotion,
  type EntitlementContext,
  type OrgSkillRecord,
} from "@runcanon/platform";

import type { AuthContext } from "./auth.js";
import { isOrgAdmin } from "./auth.js";
import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { resolveSkillPaths, type SkillPaths } from "./registry.js";

async function entitlementContext(auth: AuthContext, projectPath?: string): Promise<EntitlementContext> {
  const workspace =
    auth.user?.id != null
      ? await getActiveWorkspaceForUser(auth.user.id, isOrgAdmin(auth))
      : undefined;
  return {
    workspaceId: workspace?.id,
    // Client project path is for org assignment scoping only — not server-side skill storage.
    projectPath: projectPath ? resolve(projectPath) : undefined,
  };
}

export async function loadWorkspaceActiveSkill(
  paths: SkillPaths,
  skillId: string
): Promise<Skill | undefined> {
  try {
    const content = await readFile(join(paths.activeDir, `${skillId}.md`), "utf-8");
    const { skill } = parseSkill(content);
    return skill;
  } catch {
    return undefined;
  }
}

export async function publishWorkspaceSkillToOrg(input: {
  auth: AuthContext;
  skillId: string;
  projectPath?: string;
  directPublish?: boolean;
}): Promise<OrgSkillRecord | { queued: true; promotionId: string }> {
  const paths = await resolveSkillPaths(input.projectPath);
  const skill = await loadWorkspaceActiveSkill(paths, input.skillId);
  if (!skill) {
    throw new Error("Active workspace skill not found");
  }

  const workspace =
    input.auth.user?.id != null
      ? await getActiveWorkspaceForUser(input.auth.user.id, isOrgAdmin(input.auth))
      : undefined;

  const markdown = serializeSkill({ ...skill, status: "active" });

  if (!input.directPublish && !isOrgAdmin(input.auth)) {
    const promotion = await submitOrgPromotion({
      skillId: skill.id,
      name: skill.name,
      markdown,
      source: "workspace",
      submittedBy: input.auth.actor,
      sourceWorkspaceId: workspace?.id,
      harnesses: skill.harnesses.map((h) => (typeof h === "string" ? h : String(h))),
      tags: skill.tags,
    });
    return { queued: true, promotionId: promotion.id };
  }

  return publishOrgSkill({
    skillId: skill.id,
    name: skill.name,
    markdown,
    publishedBy: input.auth.actor,
    sourceWorkspaceId: workspace?.id,
    tags: skill.tags,
    harnesses: skill.harnesses.map((h) => (typeof h === "string" ? h : String(h))),
  });
}

export async function loadOrgSkillParsed(skillId: string): Promise<Skill | undefined> {
  const markdown = await readOrgSkillMarkdown(skillId);
  if (!markdown) return undefined;
  const { skill } = parseSkill(markdown);
  return { ...skill, status: "active" };
}

export async function listOrgSkillsForAuth(auth: AuthContext, projectPath?: string): Promise<
  Array<OrgSkillRecord & { skill?: Skill }>
> {
  const records = await listOrgSkillRecords();
  const context = await entitlementContext(auth, projectPath);
  const entitledIds = auth.user
    ? isOrgAdmin(auth)
      ? await resolveAllOrgSkillIds()
      : await resolveUserOrgSkillIds(auth.user.id, context)
    : [];

  const entitledSet = new Set(entitledIds);
  const visible = isOrgAdmin(auth) ? records : records.filter((r) => entitledSet.has(r.id));

  const enriched: Array<OrgSkillRecord & { skill?: Skill }> = [];
  for (const record of visible) {
    const skill = await loadOrgSkillParsed(record.id);
    enriched.push({ ...record, skill });
  }
  return enriched;
}

export async function getOrgSkillForAuth(
  auth: AuthContext,
  skillId: string,
  projectPath?: string
): Promise<(OrgSkillRecord & { skill: Skill }) | undefined> {
  const record = await getOrgSkillRecord(skillId);
  if (!record) return undefined;

  if (auth.user && !isOrgAdmin(auth)) {
    const context = await entitlementContext(auth, projectPath);
    const entitled = await resolveUserOrgSkillIds(auth.user.id, context);
    if (!entitled.includes(skillId)) return undefined;
  }

  const skill = await loadOrgSkillParsed(skillId);
  if (!skill) return undefined;
  return { ...record, skill };
}

export async function syncSkillsForAuth(auth: AuthContext, projectPath?: string): Promise<{
  workspaceSkills: Skill[];
  orgSkills: Skill[];
  mandatoryOrgSkillIds: string[];
  missingMandatory: string[];
}> {
  const { collectEntitledSkills } = await import("./skill-export.js");
  const context = await entitlementContext(auth, projectPath);
  const payload = await collectEntitledSkills(auth, context);
  return {
    workspaceSkills: payload.workspaceSkills,
    orgSkills: payload.orgSkills,
    mandatoryOrgSkillIds: payload.mandatoryOrgSkillIds,
    missingMandatory: payload.missingMandatory,
  };
}
