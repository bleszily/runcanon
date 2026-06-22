import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { dataDir } from "./store.js";
import { findUserById } from "./users.js";

/** Safe slug for skill ids and group slugs — prevents path traversal. */
export const SAFE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function assertSafeSlug(value: string, label = "id"): string {
  const normalized = value.trim().toLowerCase();
  if (!SAFE_SLUG_PATTERN.test(normalized) || normalized.includes("..")) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

export function assertSafeUuid(value: string, label = "id"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid ${label}`);
  }
  return parsed.data;
}

export const orgGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(128),
  slug: z.string().regex(SAFE_SLUG_PATTERN),
  description: z.string().max(512).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OrgGroup = z.infer<typeof orgGroupSchema>;

export const groupMembershipSchema = z.object({
  userId: z.string().uuid(),
  groupId: z.string().uuid(),
  addedAt: z.string(),
  addedBy: z.string(),
});

export type GroupMembership = z.infer<typeof groupMembershipSchema>;

export const orgSkillRecordSchema = z.object({
  id: z.string().regex(SAFE_SLUG_PATTERN),
  name: z.string().min(1),
  version: z.number().int().positive(),
  status: z.enum(["published", "archived"]),
  publishedAt: z.string(),
  publishedBy: z.string(),
  sourceWorkspaceId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  harnesses: z.array(z.string()).default([]),
  /** ISO date when skill certification expires (re-certification required). */
  certExpiresAt: z.string().optional(),
  /** ISO date when curator review is due (SLA). */
  reviewDueAt: z.string().optional(),
  lastReviewedAt: z.string().optional(),
});

export type OrgSkillRecord = z.infer<typeof orgSkillRecordSchema>;

export const skillAssignmentSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().regex(SAFE_SLUG_PATTERN),
  targetType: z.enum(["user", "group"]),
  targetId: z.string().uuid(),
  mandatory: z.boolean().default(false),
  createdAt: z.string(),
  createdBy: z.string(),
  /** Optional expiry — assignment ignored after this ISO timestamp. */
  expiresAt: z.string().optional(),
  /** Limit assignment to a specific workspace (tenant isolation). */
  workspaceId: z.string().uuid().optional(),
  /** Limit assignment to projects matching this slug/path fragment. */
  projectSlug: z.string().max(256).optional(),
  /** Pin to specific org skill version (optional). */
  skillVersion: z.number().int().positive().optional(),
});

export type SkillAssignment = z.infer<typeof skillAssignmentSchema>;

export const orgPromotionSchema = z.object({
  id: z.string().uuid(),
  skillId: z.string().regex(SAFE_SLUG_PATTERN),
  name: z.string().min(1),
  markdown: z.string().max(512_000),
  source: z.enum(["workspace", "import", "manual"]),
  sourceWorkspaceId: z.string().uuid().optional(),
  submittedBy: z.string(),
  submittedAt: z.string(),
  status: z.enum(["pending", "approved", "rejected"]),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().optional(),
  rejectionReason: z.string().max(1024).optional(),
  assessmentScore: z.number().min(0).max(1).optional(),
  harnesses: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type OrgPromotion = z.infer<typeof orgPromotionSchema>;

export const orgMetricsSchema = z.object({
  updatedAt: z.string(),
  totalPublishedSkills: z.number().int().nonnegative(),
  totalAssignments: z.number().int().nonnegative(),
  totalSyncs: z.number().int().nonnegative(),
  totalExports: z.number().int().nonnegative(),
  trajectorySessionsProcessed: z.number().int().nonnegative(),
  skillsCreatedFromMining: z.number().int().nonnegative(),
  adoptionRate: z.number().min(0).max(1),
});

export type OrgMetrics = z.infer<typeof orgMetricsSchema>;

function emptyOrgMetrics(now = new Date().toISOString()): OrgMetrics {
  return {
    updatedAt: now,
    totalPublishedSkills: 0,
    totalAssignments: 0,
    totalSyncs: 0,
    totalExports: 0,
    trajectorySessionsProcessed: 0,
    skillsCreatedFromMining: 0,
    adoptionRate: 0,
  };
}

/** Recompute counts derived from orgSkills/assignments into persisted metrics. */
function refreshDerivedOrgMetrics(store: OrgStore): void {
  if (!store.metrics) {
    store.metrics = emptyOrgMetrics();
  }
  const published = store.orgSkills.filter((s) => s.status === "published").length;
  const assigned = store.assignments.length;
  store.metrics.totalPublishedSkills = published;
  store.metrics.totalAssignments = assigned;
  store.metrics.adoptionRate =
    assigned > 0 ? Math.min(1, store.metrics.totalSyncs / assigned) : 0;
  store.metrics.updatedAt = new Date().toISOString();
}

/** Live view of metrics (always reflects current orgSkills/assignments). */
function deriveOrgMetricsFromStore(store: OrgStore): OrgMetrics {
  const base = store.metrics ?? emptyOrgMetrics();
  const published = store.orgSkills.filter((s) => s.status === "published").length;
  const assigned = store.assignments.length;
  return {
    ...base,
    updatedAt: new Date().toISOString(),
    totalPublishedSkills: published,
    totalAssignments: assigned,
    adoptionRate: assigned > 0 ? Math.min(1, base.totalSyncs / assigned) : 0,
  };
}

export const orgAuditEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string(),
  action: z.string(),
  actor: z.string(),
  resourceType: z.enum(["org_skill", "group", "assignment", "membership", "promotion", "sync", "export", "bundle"]),
  resourceId: z.string().optional(),
  note: z.string().optional(),
});

export type OrgAuditEntry = z.infer<typeof orgAuditEntrySchema>;

export const orgStoreSchema = z.object({
  schemaVersion: z.enum(["1.0.0", "1.1.0"]),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    createdAt: z.string(),
  }),
  groups: z.array(orgGroupSchema).default([]),
  memberships: z.array(groupMembershipSchema).default([]),
  orgSkills: z.array(orgSkillRecordSchema).default([]),
  assignments: z.array(skillAssignmentSchema).default([]),
  promotionQueue: z.array(orgPromotionSchema).default([]),
  metrics: orgMetricsSchema.optional(),
});

export type OrgStore = z.infer<typeof orgStoreSchema>;

function migrateOrgStore(raw: OrgStore): OrgStore {
  if (!raw.promotionQueue) raw.promotionQueue = [];
  if (!raw.metrics) {
    raw.metrics = {
      updatedAt: new Date().toISOString(),
      totalPublishedSkills: raw.orgSkills.filter((s) => s.status === "published").length,
      totalAssignments: raw.assignments.length,
      totalSyncs: 0,
      totalExports: 0,
      trajectorySessionsProcessed: 0,
      skillsCreatedFromMining: 0,
      adoptionRate: 0,
    };
  }
  for (const skill of raw.orgSkills) {
    if (skill.certExpiresAt === undefined) skill.certExpiresAt = undefined;
  }
  for (const assignment of raw.assignments) {
    if (assignment.expiresAt === undefined) assignment.expiresAt = undefined;
    if (assignment.workspaceId === undefined) assignment.workspaceId = undefined;
    if (assignment.projectSlug === undefined) assignment.projectSlug = undefined;
  }
  raw.schemaVersion = "1.1.0";
  return raw;
}

function orgDir(): string {
  return join(dataDir(), "org");
}

function orgStorePath(): string {
  return join(orgDir(), "store.json");
}

function orgSkillsDir(): string {
  return join(orgDir(), "skills");
}

function orgSkillPath(skillId: string): string {
  return join(orgSkillsDir(), `${assertSafeSlug(skillId, "skillId")}.md`);
}

function orgAuditPath(): string {
  return join(orgDir(), "audit.jsonl");
}

export function emptyOrgStore(name = "Organization"): OrgStore {
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.1.0",
    organization: {
      id: randomUUID(),
      name,
      createdAt: now,
    },
    groups: [],
    memberships: [],
    orgSkills: [],
    assignments: [],
    promotionQueue: [],
    metrics: emptyOrgMetrics(now),
  };
}

export async function readOrgStore(): Promise<OrgStore> {
  try {
    const raw = await readFile(orgStorePath(), "utf-8");
    const parsed = orgStoreSchema.parse(JSON.parse(raw));
    return migrateOrgStore(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyOrgStore(process.env.RUNCANON_ORG_NAME ?? "RunCanon Organization");
    }
    throw error;
  }
}

export async function writeOrgStore(store: OrgStore): Promise<void> {
  await mkdir(orgDir(), { recursive: true });
  const path = orgStorePath();
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(store, null, 2), "utf-8");
  await rename(temp, path);
}

export async function mutateOrgStore<T>(fn: (store: OrgStore) => T | Promise<T>): Promise<T> {
  const store = await readOrgStore();
  const result = await fn(store);
  await writeOrgStore(store);
  return result;
}

export async function ensureOrgStore(): Promise<OrgStore> {
  try {
    await readFile(orgStorePath(), "utf-8");
    return readOrgStore();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const store = emptyOrgStore(process.env.RUNCANON_ORG_NAME ?? "RunCanon Organization");
      await writeOrgStore(store);
      return store;
    }
    throw error;
  }
}

export async function appendOrgAudit(entry: Omit<OrgAuditEntry, "id" | "timestamp">): Promise<OrgAuditEntry> {
  await mkdir(orgDir(), { recursive: true });
  const record: OrgAuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await writeFile(orgAuditPath(), `${JSON.stringify(record)}\n`, { flag: "a", encoding: "utf-8" });
  return record;
}

export async function readRecentOrgAudit(limit = 50): Promise<OrgAuditEntry[]> {
  try {
    const raw = await readFile(orgAuditPath(), "utf-8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => orgAuditEntrySchema.parse(JSON.parse(line)))
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function listOrgGroups(): Promise<OrgGroup[]> {
  const store = await readOrgStore();
  return store.groups;
}

export async function createOrgGroup(input: {
  name: string;
  slug?: string;
  description?: string;
  actor: string;
}): Promise<OrgGroup> {
  const now = new Date().toISOString();
  const slug = assertSafeSlug(
    input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    "slug"
  );

  const group = await mutateOrgStore((store) => {
    if (store.groups.some((g) => g.slug === slug)) {
      throw new Error("Group slug already exists");
    }
    const record: OrgGroup = {
      id: randomUUID(),
      name: input.name.trim(),
      slug,
      description: input.description?.trim(),
      createdAt: now,
      updatedAt: now,
    };
    store.groups.push(record);
    return record;
  });

  await appendOrgAudit({
    action: "group.create",
    actor: input.actor,
    resourceType: "group",
    resourceId: group.id,
    note: group.name,
  });

  return group;
}

export async function deleteOrgGroup(groupId: string, actor: string): Promise<void> {
  const id = assertSafeUuid(groupId, "groupId");
  await mutateOrgStore((store) => {
    const idx = store.groups.findIndex((g) => g.id === id);
    if (idx < 0) throw new Error("Group not found");
    store.groups.splice(idx, 1);
    store.memberships = store.memberships.filter((m) => m.groupId !== id);
    store.assignments = store.assignments.filter((a) => !(a.targetType === "group" && a.targetId === id));
  });
  await appendOrgAudit({
    action: "group.delete",
    actor,
    resourceType: "group",
    resourceId: id,
  });
}

export async function addGroupMember(input: {
  groupId: string;
  userId: string;
  actor: string;
}): Promise<GroupMembership> {
  const groupId = assertSafeUuid(input.groupId, "groupId");
  const userId = assertSafeUuid(input.userId, "userId");
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");

  const membership = await mutateOrgStore((store) => {
    if (!store.groups.some((g) => g.id === groupId)) {
      throw new Error("Group not found");
    }
    if (store.memberships.some((m) => m.groupId === groupId && m.userId === userId)) {
      throw new Error("User is already in this group");
    }
    const record: GroupMembership = {
      groupId,
      userId,
      addedAt: new Date().toISOString(),
      addedBy: input.actor,
    };
    store.memberships.push(record);
    return record;
  });

  await appendOrgAudit({
    action: "membership.add",
    actor: input.actor,
    resourceType: "membership",
    resourceId: `${groupId}:${userId}`,
    note: user.email,
  });

  return membership;
}

export async function removeGroupMember(input: {
  groupId: string;
  userId: string;
  actor: string;
}): Promise<void> {
  const groupId = assertSafeUuid(input.groupId, "groupId");
  const userId = assertSafeUuid(input.userId, "userId");

  await mutateOrgStore((store) => {
    const idx = store.memberships.findIndex((m) => m.groupId === groupId && m.userId === userId);
    if (idx < 0) throw new Error("Membership not found");
    store.memberships.splice(idx, 1);
  });

  await appendOrgAudit({
    action: "membership.remove",
    actor: input.actor,
    resourceType: "membership",
    resourceId: `${groupId}:${userId}`,
  });
}

export async function listOrgSkillRecords(): Promise<OrgSkillRecord[]> {
  const store = await readOrgStore();
  return store.orgSkills.filter((s) => s.status === "published");
}

export async function getOrgSkillRecord(skillId: string): Promise<OrgSkillRecord | undefined> {
  const id = assertSafeSlug(skillId, "skillId");
  const store = await readOrgStore();
  return store.orgSkills.find((s) => s.id === id && s.status === "published");
}

export async function readOrgSkillMarkdown(skillId: string): Promise<string | undefined> {
  const id = assertSafeSlug(skillId, "skillId");
  try {
    return await readFile(orgSkillPath(id), "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function publishOrgSkill(input: {
  skillId: string;
  name: string;
  markdown: string;
  publishedBy: string;
  sourceWorkspaceId?: string;
  tags?: string[];
  harnesses?: string[];
}): Promise<OrgSkillRecord> {
  const skillId = assertSafeSlug(input.skillId, "skillId");
  if (input.markdown.length > 512_000) {
    throw new Error("Skill content exceeds maximum size");
  }

  await mkdir(orgSkillsDir(), { recursive: true });

  const record = await mutateOrgStore((store) => {
    const existing = store.orgSkills.find((s) => s.id === skillId);
    const version = (existing?.version ?? 0) + 1;
    const next: OrgSkillRecord = {
      id: skillId,
      name: input.name.trim(),
      version,
      status: "published",
      publishedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      sourceWorkspaceId: input.sourceWorkspaceId,
      tags: input.tags ?? existing?.tags ?? [],
      harnesses: input.harnesses ?? existing?.harnesses ?? [],
    };

    if (existing) {
      Object.assign(existing, next);
    } else {
      store.orgSkills.push(next);
    }
    refreshDerivedOrgMetrics(store);
    return next;
  });

  const path = orgSkillPath(skillId);
  const temp = `${path}.tmp`;
  await writeFile(temp, input.markdown, "utf-8");
  await rename(temp, path);

  await appendOrgAudit({
    action: "org.publish",
    actor: input.publishedBy,
    resourceType: "org_skill",
    resourceId: skillId,
    note: `v${record.version}`,
  });

  return record;
}

/** Update org skill markdown in place (creates new version). */
export async function updateOrgSkillContent(input: {
  skillId: string;
  markdown: string;
  name?: string;
  updatedBy: string;
}): Promise<OrgSkillRecord> {
  const skillId = assertSafeSlug(input.skillId, "skillId");
  if (input.markdown.length > 512_000) {
    throw new Error("Skill content exceeds maximum size");
  }

  const store = await readOrgStore();
  const existing = store.orgSkills.find((s) => s.id === skillId && s.status === "published");
  if (!existing) throw new Error("Org skill not found");

  return publishOrgSkill({
    skillId,
    name: input.name?.trim() || existing.name,
    markdown: input.markdown,
    publishedBy: input.updatedBy,
    sourceWorkspaceId: existing.sourceWorkspaceId,
    tags: existing.tags,
    harnesses: existing.harnesses,
  });
}

export async function archiveOrgSkill(skillId: string, actor: string): Promise<void> {
  const id = assertSafeSlug(skillId, "skillId");
  await mutateOrgStore((store) => {
    const skill = store.orgSkills.find((s) => s.id === id);
    if (!skill) throw new Error("Org skill not found");
    skill.status = "archived";
    store.assignments = store.assignments.filter((a) => a.skillId !== id);
    refreshDerivedOrgMetrics(store);
  });
  await appendOrgAudit({
    action: "org.archive",
    actor,
    resourceType: "org_skill",
    resourceId: id,
  });
}

/** Permanently remove an org skill, its markdown file, assignments, and pending promotions. */
export async function deleteOrgSkill(skillId: string, actor: string): Promise<void> {
  const id = assertSafeSlug(skillId, "skillId");

  await mutateOrgStore((store) => {
    const idx = store.orgSkills.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("Org skill not found");
    store.orgSkills.splice(idx, 1);
    store.assignments = store.assignments.filter((a) => a.skillId !== id);
    store.promotionQueue = store.promotionQueue.filter((p) => p.skillId !== id);
    refreshDerivedOrgMetrics(store);
  });

  try {
    await unlink(orgSkillPath(id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await appendOrgAudit({
    action: "org.delete",
    actor,
    resourceType: "org_skill",
    resourceId: id,
  });
}

export async function listSkillAssignments(): Promise<SkillAssignment[]> {
  const store = await readOrgStore();
  return store.assignments;
}

export async function createSkillAssignment(input: {
  skillId: string;
  targetType: "user" | "group";
  targetId: string;
  mandatory?: boolean;
  actor: string;
  expiresAt?: string;
  workspaceId?: string;
  projectSlug?: string;
  skillVersion?: number;
}): Promise<SkillAssignment> {
  const skillId = assertSafeSlug(input.skillId, "skillId");
  const targetId = assertSafeUuid(input.targetId, "targetId");

  const assignment = await mutateOrgStore(async (store) => {
    const skill = store.orgSkills.find((s) => s.id === skillId && s.status === "published");
    if (!skill) throw new Error("Org skill not found or not published");

    if (input.targetType === "user") {
      const user = await findUserById(targetId);
      if (!user) throw new Error("User not found");
    } else {
      if (!store.groups.some((g) => g.id === targetId)) {
        throw new Error("Group not found");
      }
    }

    if (
      store.assignments.some(
        (a) => a.skillId === skillId && a.targetType === input.targetType && a.targetId === targetId
      )
    ) {
      throw new Error("Assignment already exists");
    }

    const record: SkillAssignment = {
      id: randomUUID(),
      skillId,
      targetType: input.targetType,
      targetId,
      mandatory: input.mandatory ?? false,
      createdAt: new Date().toISOString(),
      createdBy: input.actor,
      expiresAt: input.expiresAt,
      workspaceId: input.workspaceId,
      projectSlug: input.projectSlug,
      skillVersion: input.skillVersion,
    };
    store.assignments.push(record);
    refreshDerivedOrgMetrics(store);
    return record;
  });

  await appendOrgAudit({
    action: "org.assign",
    actor: input.actor,
    resourceType: "assignment",
    resourceId: assignment.id,
    note: `${skillId} → ${input.targetType}:${targetId}`,
  });

  return assignment;
}

export async function deleteSkillAssignment(assignmentId: string, actor: string): Promise<void> {
  const id = assertSafeUuid(assignmentId, "assignmentId");
  await mutateOrgStore((store) => {
    const idx = store.assignments.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error("Assignment not found");
    store.assignments.splice(idx, 1);
    refreshDerivedOrgMetrics(store);
  });
  await appendOrgAudit({
    action: "org.unassign",
    actor,
    resourceType: "assignment",
    resourceId: id,
  });
}

export async function listOrgGroupsWithMembers(): Promise<
  Array<OrgGroup & { memberIds: string[]; memberCount: number }>
> {
  const store = await readOrgStore();
  return store.groups.map((group) => {
    const memberIds = store.memberships.filter((m) => m.groupId === group.id).map((m) => m.userId);
    return { ...group, memberIds, memberCount: memberIds.length };
  });
}

export interface EntitlementContext {
  workspaceId?: string;
  projectPath?: string;
}

function isAssignmentActive(assignment: SkillAssignment, context?: EntitlementContext): boolean {
  if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
    return false;
  }
  if (assignment.workspaceId && context?.workspaceId && assignment.workspaceId !== context.workspaceId) {
    return false;
  }
  if (assignment.projectSlug && context?.projectPath) {
    const slug = assignment.projectSlug.toLowerCase();
    const path = context.projectPath.toLowerCase();
    if (!path.includes(slug)) return false;
  }
  return true;
}

function isOrgSkillCurrentlyValid(skill: OrgSkillRecord): boolean {
  if (skill.status !== "published") return false;
  if (skill.certExpiresAt && new Date(skill.certExpiresAt) < new Date()) return false;
  return true;
}

/** Resolve org skill ids a user is entitled to (assignments, expiry, project scope). */
export async function resolveUserOrgSkillIds(
  userId: string,
  context?: EntitlementContext
): Promise<string[]> {
  const uid = assertSafeUuid(userId, "userId");
  const store = await readOrgStore();
  const groupIds = new Set(store.memberships.filter((m) => m.userId === uid).map((m) => m.groupId));
  const entitled = new Set<string>();

  for (const assignment of store.assignments) {
    if (!isAssignmentActive(assignment, context)) continue;
    const skill = store.orgSkills.find((s) => s.id === assignment.skillId);
    if (!skill || !isOrgSkillCurrentlyValid(skill)) continue;
    if (assignment.skillVersion && skill.version < assignment.skillVersion) continue;

    if (assignment.targetType === "user" && assignment.targetId === uid) {
      entitled.add(assignment.skillId);
    }
    if (assignment.targetType === "group" && groupIds.has(assignment.targetId)) {
      entitled.add(assignment.skillId);
    }
  }

  return [...entitled];
}

/** Submit a skill to the org promotion queue (curator review before publish). */
export async function submitOrgPromotion(input: {
  skillId: string;
  name: string;
  markdown: string;
  source: OrgPromotion["source"];
  submittedBy: string;
  sourceWorkspaceId?: string;
  assessmentScore?: number;
  harnesses?: string[];
  tags?: string[];
}): Promise<OrgPromotion> {
  const skillId = assertSafeSlug(input.skillId, "skillId");
  if (input.markdown.length > 512_000) throw new Error("Skill content exceeds maximum size");

  const promotion = await mutateOrgStore((store) => {
    const pending = store.promotionQueue.find((p) => p.skillId === skillId && p.status === "pending");
    if (pending) throw new Error("Skill already pending promotion");

    const record: OrgPromotion = {
      id: randomUUID(),
      skillId,
      name: input.name.trim(),
      markdown: input.markdown,
      source: input.source,
      sourceWorkspaceId: input.sourceWorkspaceId,
      submittedBy: input.submittedBy,
      submittedAt: new Date().toISOString(),
      status: "pending",
      assessmentScore: input.assessmentScore,
      harnesses: input.harnesses ?? [],
      tags: input.tags ?? [],
    };
    store.promotionQueue.push(record);
    return record;
  });

  await appendOrgAudit({
    action: "promotion.submit",
    actor: input.submittedBy,
    resourceType: "promotion",
    resourceId: promotion.id,
    note: skillId,
  });

  return promotion;
}

export async function listOrgPromotions(status?: OrgPromotion["status"]): Promise<OrgPromotion[]> {
  const store = await readOrgStore();
  return store.promotionQueue.filter((p) => !status || p.status === status);
}

export async function approveOrgPromotion(input: {
  promotionId: string;
  reviewer: string;
  certExpiresAt?: string;
  reviewDueAt?: string;
}): Promise<OrgSkillRecord> {
  const promotionId = assertSafeUuid(input.promotionId, "promotionId");
  const store = await readOrgStore();
  const promotion = store.promotionQueue.find((p) => p.id === promotionId && p.status === "pending");
  if (!promotion) throw new Error("Promotion not found or not pending");

  const record = await publishOrgSkill({
    skillId: promotion.skillId,
    name: promotion.name,
    markdown: promotion.markdown,
    publishedBy: input.reviewer,
    sourceWorkspaceId: promotion.sourceWorkspaceId,
    tags: promotion.tags,
    harnesses: promotion.harnesses,
  });

  await mutateOrgStore((s) => {
    const p = s.promotionQueue.find((x) => x.id === promotionId);
    if (p) {
      p.status = "approved";
      p.reviewedBy = input.reviewer;
      p.reviewedAt = new Date().toISOString();
    }
    const skill = s.orgSkills.find((x) => x.id === record.id);
    if (skill) {
      if (input.certExpiresAt) skill.certExpiresAt = input.certExpiresAt;
      if (input.reviewDueAt) skill.reviewDueAt = input.reviewDueAt;
      skill.lastReviewedAt = new Date().toISOString();
    }
    refreshDerivedOrgMetrics(s);
  });

  await appendOrgAudit({
    action: "promotion.approve",
    actor: input.reviewer,
    resourceType: "promotion",
    resourceId: promotionId,
    note: record.id,
  });

  return record;
}

export async function rejectOrgPromotion(input: {
  promotionId: string;
  reviewer: string;
  reason?: string;
}): Promise<void> {
  const promotionId = assertSafeUuid(input.promotionId, "promotionId");
  await mutateOrgStore((store) => {
    const p = store.promotionQueue.find((x) => x.id === promotionId && x.status === "pending");
    if (!p) throw new Error("Promotion not found or not pending");
    p.status = "rejected";
    p.reviewedBy = input.reviewer;
    p.reviewedAt = new Date().toISOString();
    p.rejectionReason = input.reason?.slice(0, 1024);
  });
  await appendOrgAudit({
    action: "promotion.reject",
    actor: input.reviewer,
    resourceType: "promotion",
    resourceId: promotionId,
  });
}

export async function incrementOrgMetric(
  key: keyof Pick<
    OrgMetrics,
    "totalSyncs" | "totalExports" | "trajectorySessionsProcessed" | "skillsCreatedFromMining"
  >,
  delta = 1
): Promise<void> {
  await mutateOrgStore((store) => {
    if (!store.metrics) {
      store.metrics = emptyOrgMetrics();
    }
    store.metrics[key] += delta;
    refreshDerivedOrgMetrics(store);
  });
}

export async function getOrgMetrics(): Promise<OrgMetrics> {
  const store = await readOrgStore();
  return deriveOrgMetricsFromStore(store);
}

/** Bulk import group memberships from CSV rows: email,groupSlug */
export async function importGroupMembershipsFromCsv(input: {
  rows: Array<{ email: string; groupSlug: string }>;
  actor: string;
  findUserByEmail: (email: string) => Promise<{ id: string } | undefined>;
}): Promise<{ added: number; skipped: number; errors: string[] }> {
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of input.rows) {
    try {
      const user = await input.findUserByEmail(row.email.trim().toLowerCase());
      if (!user) {
        errors.push(`User not found: ${row.email}`);
        continue;
      }
      const store = await readOrgStore();
      const group = store.groups.find((g) => g.slug === row.groupSlug.trim().toLowerCase());
      if (!group) {
        errors.push(`Group not found: ${row.groupSlug}`);
        continue;
      }
      await addGroupMember({ groupId: group.id, userId: user.id, actor: input.actor });
      added++;
    } catch (err) {
      if (err instanceof Error && err.message.includes("already")) {
        skipped++;
      } else {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  await appendOrgAudit({
    action: "membership.import",
    actor: input.actor,
    resourceType: "membership",
    note: `CSV: ${added} added, ${skipped} skipped`,
  });

  return { added, skipped, errors };
}

export async function recordOrgSync(actor: string, skillCount: number): Promise<void> {
  await incrementOrgMetric("totalSyncs");
  await appendOrgAudit({
    action: "org.sync",
    actor,
    resourceType: "sync",
    note: `${skillCount} skills`,
  });
}

export async function recordOrgExport(actor: string, skillCount: number): Promise<void> {
  await incrementOrgMetric("totalExports");
  await appendOrgAudit({
    action: "org.export",
    actor,
    resourceType: "export",
    note: `${skillCount} skills`,
  });
}

/** All published org skill ids (admin/curator entitlement). */
export async function resolveAllOrgSkillIds(): Promise<string[]> {
  const store = await readOrgStore();
  return store.orgSkills.filter((s) => isOrgSkillCurrentlyValid(s)).map((s) => s.id);
}

export async function listUserAssignments(
  userId: string,
  context?: EntitlementContext
): Promise<Array<SkillAssignment & { skill?: OrgSkillRecord }>> {
  const uid = assertSafeUuid(userId, "userId");
  const store = await readOrgStore();
  const groupIds = new Set(store.memberships.filter((m) => m.userId === uid).map((m) => m.groupId));
  const skillById = new Map(store.orgSkills.map((s) => [s.id, s]));

  return store.assignments
    .filter((a) => {
      if (!isAssignmentActive(a, context)) return false;
      const skill = skillById.get(a.skillId);
      if (!skill || !isOrgSkillCurrentlyValid(skill)) return false;
      if (a.targetType === "user" && a.targetId === uid) return true;
      if (a.targetType === "group" && groupIds.has(a.targetId)) return true;
      return false;
    })
    .map((a) => ({ ...a, skill: skillById.get(a.skillId) }));
}
