import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  dataDir,
  listOrgPromotions,
  listSkillAssignments,
  listUserAssignments,
  readOrgStore,
  readRecentOrgAudit,
} from "@runcanon/platform";

import { listProposals, resolveSkillPaths, type SkillPaths } from "./registry.js";

export type NotificationType =
  | "proposal"
  | "org_promotion"
  | "org_assignment"
  | "my_assignment"
  | "audit";

export interface DashboardNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  href?: string;
}

export interface UserNotificationState {
  readIds: string[];
  dismissedIds: string[];
  updatedAt: string;
}

function emptyNotificationState(now = new Date().toISOString()): UserNotificationState {
  return { readIds: [], dismissedIds: [], updatedAt: now };
}

function parseNotificationState(raw: unknown): UserNotificationState {
  if (!raw || typeof raw !== "object") return emptyNotificationState();
  const data = raw as Record<string, unknown>;
  return {
    readIds: Array.isArray(data.readIds) ? data.readIds.filter((id): id is string => typeof id === "string") : [],
    dismissedIds: Array.isArray(data.dismissedIds)
      ? data.dismissedIds.filter((id): id is string => typeof id === "string")
      : [],
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}

function truncate(text: string, max = 160): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function userNotificationsPath(userId: string): string {
  return join(dataDir(), "users", userId, "notifications.json");
}

async function writeUserNotificationState(userId: string, state: UserNotificationState): Promise<void> {
  const path = userNotificationsPath(userId);
  await mkdir(join(path, ".."), { recursive: true });
  const temp = `${path}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), "utf-8");
  await rename(temp, path);
}

export async function readUserNotificationState(userId: string): Promise<UserNotificationState> {
  try {
    const raw = await readFile(userNotificationsPath(userId), "utf-8");
    return parseNotificationState(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyNotificationState();
    }
    throw error;
  }
}

async function mutateUserNotificationState(
  userId: string,
  mutate: (state: UserNotificationState) => void
): Promise<UserNotificationState> {
  const state = await readUserNotificationState(userId);
  mutate(state);
  state.updatedAt = new Date().toISOString();
  await writeUserNotificationState(userId, state);
  return state;
}

export async function markNotificationsRead(userId: string, ids: string[]): Promise<UserNotificationState> {
  if (ids.length === 0) return readUserNotificationState(userId);
  return mutateUserNotificationState(userId, (state) => {
    const read = new Set(state.readIds);
    for (const id of ids) read.add(id);
    state.readIds = [...read];
  });
}

export async function dismissNotifications(userId: string, ids: string[]): Promise<UserNotificationState> {
  if (ids.length === 0) return readUserNotificationState(userId);
  return mutateUserNotificationState(userId, (state) => {
    const dismissed = new Set(state.dismissedIds);
    const read = new Set(state.readIds);
    for (const id of ids) {
      dismissed.add(id);
      read.add(id);
    }
    state.dismissedIds = [...dismissed];
    state.readIds = [...read];
  });
}

export async function markAllNotificationsRead(
  userId: string,
  notificationIds: string[]
): Promise<UserNotificationState> {
  return markNotificationsRead(userId, notificationIds);
}

function applyNotificationState(
  notifications: DashboardNotification[],
  state: UserNotificationState
): DashboardNotification[] {
  const dismissed = new Set(state.dismissedIds);
  const read = new Set(state.readIds);

  return notifications
    .filter((n) => !dismissed.has(n.id))
    .map((n) => ({
      ...n,
      read: read.has(n.id) || n.read,
    }));
}

async function buildRawNotifications(input: {
  paths: SkillPaths;
  userId: string;
  isOrgAdmin: boolean;
}): Promise<DashboardNotification[]> {
  const { paths, userId, isOrgAdmin } = input;
  const [proposals, audit] = await Promise.all([listProposals(paths), readRecentOrgAudit(10)]);

  const notifications: DashboardNotification[] = [
    ...proposals.map((p) => ({
      id: `prop-${p.id}`,
      type: "proposal" as const,
      title: `Pending: ${p.payload.name}`,
      message: truncate(p.reason),
      timestamp: p.payload.metrics.generatedAt,
      read: false,
      href: `/proposals?proposal=${encodeURIComponent(p.id)}`,
    })),
  ];

  if (isOrgAdmin) {
    const [promotions, assignments, orgSkills] = await Promise.all([
      listOrgPromotions("pending"),
      listSkillAssignments(),
      readOrgStore().then((store) => store.orgSkills),
    ]);
    const skillNames = new Map(orgSkills.map((s) => [s.id, s.name]));
    const assignmentCutoff = Date.now() - 14 * 86_400_000;

    for (const promotion of promotions) {
      notifications.push({
        id: `org-promo-${promotion.id}`,
        type: "org_promotion",
        title: `Promotion pending: ${promotion.name}`,
        message: truncate(`Submitted by ${promotion.submittedBy}. Review before publishing to the org library.`),
        timestamp: promotion.submittedAt,
        read: false,
        href: "/admin/promotions",
      });
    }

    for (const assignment of assignments) {
      if (new Date(assignment.createdAt).getTime() < assignmentCutoff) continue;
      const skillName = skillNames.get(assignment.skillId) ?? assignment.skillId;
      notifications.push({
        id: `org-assign-${assignment.id}`,
        type: "org_assignment",
        title: `Assignment created: ${skillName}`,
        message: truncate(
          `${assignment.mandatory ? "Mandatory" : "Optional"} ${assignment.targetType} assignment by ${assignment.createdBy}`
        ),
        timestamp: assignment.createdAt,
        read: false,
        href: "/admin/assignments",
      });
    }
  } else {
    const myAssignments = await listUserAssignments(userId);
    const assignmentCutoff = Date.now() - 30 * 86_400_000;

    for (const assignment of myAssignments) {
      if (new Date(assignment.createdAt).getTime() < assignmentCutoff) continue;
      notifications.push({
        id: `my-assign-${assignment.id}`,
        type: "my_assignment",
        title: `Assigned: ${assignment.skill?.name ?? assignment.skillId}`,
        message: truncate(
          assignment.mandatory
            ? "Mandatory org skill — sync it to your workspace from Settings."
            : "New org skill available — sync from Settings or the org library."
        ),
        timestamp: assignment.createdAt,
        read: false,
        href: "/settings",
      });
    }
  }

  notifications.push(
    ...(isOrgAdmin
      ? audit.slice(0, 5).map((entry) => ({
          id: `org-audit-${entry.id}`,
          type: "audit" as const,
          title: entry.action,
          message: truncate(entry.note ?? entry.resourceId ?? ""),
          timestamp: entry.timestamp,
          read: true,
          href: "/admin/metrics",
        }))
      : [])
  );

  return notifications.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function listDashboardNotifications(input: {
  userId: string;
  isOrgAdmin: boolean;
}): Promise<{ notifications: DashboardNotification[]; unreadCount: number }> {
  const paths = await resolveSkillPaths();
  const [raw, state] = await Promise.all([
    buildRawNotifications({ ...input, paths }),
    readUserNotificationState(input.userId),
  ]);

  const notifications = applyNotificationState(raw, state);
  const unreadCount = notifications.filter((n) => !n.read).length;
  return { notifications, unreadCount };
}
