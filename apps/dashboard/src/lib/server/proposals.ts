import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SkillProposal } from "@runcanon/spec";

import { readRecentAudit, type AuditEntry } from "./audit.js";
import { auditEntriesForProposal } from "./proposal-audit.js";
import { consolidateProposalRecords, type DashboardProposalRecord } from "./proposal-consolidation.js";
import { listProposals, readProposalRecords, readSkillDirectory, resolveSkillPaths, type SkillPaths } from "./registry.js";

async function readProposalDirectory(dir: string): Promise<SkillProposal[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const proposals: SkillProposal[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = await readFile(join(dir, entry), "utf-8");
      proposals.push(JSON.parse(raw) as SkillProposal);
    } catch {
      continue;
    }
  }
  return proposals;
}

export type { DashboardProposalRecord } from "./proposal-consolidation.js";

/** Load proposals across pending, rejected, and applied registry folders plus audit context. */
export async function listAllProposals(paths: SkillPaths): Promise<DashboardProposalRecord[]> {
  const appliedDir = paths.registryAppliedDir;
  const [pendingEnriched, rejected, applied, audit, activeSkills] = await Promise.all([
    listProposals(paths),
    readProposalDirectory(paths.registryRejectedDir),
    readProposalDirectory(appliedDir),
    readRecentAudit(paths, 200),
    readSkillDirectory(paths.activeDir),
  ]);
  const activeById = new Map(activeSkills.map((skill) => [skill.id, skill]));

  const records: DashboardProposalRecord[] = [
    ...pendingEnriched.map((proposal) => ({
      ...proposal,
      status: "pending" as const,
    })),
    ...rejected.map((proposal) => ({
      ...proposal,
      status: "rejected" as const,
      resolvedAt: proposal.metadata?.rejectedAt,
    })),
    ...applied.map((proposal) => ({
      ...proposal,
      status: "applied" as const,
      resolvedAt: proposal.metadata?.appliedAt,
    })),
  ];

  // Include approve actions that predate applied archive (back-compat).
  const knownIds = new Set(records.map((r) => r.id));
  const knownSkillIds = new Set(records.map((r) => r.skillId));
  for (const entry of audit.filter((a) => a.action === "proposal.approve")) {
    if (!entry.resourceId || knownIds.has(entry.resourceId)) continue;
    const skillId = entry.note?.match(/Approved skill (\S+)/)?.[1];
    const resolvedId = skillId ?? entry.resourceId;
    if (knownSkillIds.has(resolvedId)) continue;
    const activeSkill = activeById.get(resolvedId);
    if (!activeSkill) continue;

    records.push({
      id: entry.resourceId,
      skillId: resolvedId,
      action: "create",
      confidence: 1,
      reason: entry.note ?? "Approved via dashboard",
      payload: activeSkill,
      status: "applied",
      resolvedAt: entry.timestamp,
    });
    knownIds.add(entry.resourceId);
    knownSkillIds.add(resolvedId);
  }

  for (const record of records) {
    const entries = auditEntriesForProposal(audit, record.id);
    if (entries.length > 0 && !record.resolvedAt) {
      const latest = entries[0];
      if (latest.action === "proposal.reject") record.status = "rejected";
      if (latest.action === "proposal.approve") record.status = "applied";
      record.resolvedAt = latest.timestamp;
    }
  }

  return consolidateProposalRecords(records);
}

export async function countPendingProposals(paths?: SkillPaths): Promise<number> {
  const resolved = paths ?? (await resolveSkillPaths());
  const pending = await readProposalRecords(resolved);
  return pending.length;
}
