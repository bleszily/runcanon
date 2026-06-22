import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  canonicalSkillKey,
  isNearDuplicateSkillKey,
  isNoiseSkillIdentity,
  formatSkillDisplayName,
  matchesAnyActiveSkillKey,
} from "@runcanon/core";
import { parseSkill, serializeSkill, type Skill, type SkillProposal } from "@runcanon/spec";
import { listWorkspaces } from "@runcanon/platform";

import { appendAudit } from "./audit.js";
import {
  readRegistry,
  readSkillDirectory,
  resolveSkillPaths,
  resolveSkillPathsForRoot,
  type SkillPaths,
} from "./registry.js";

export interface PruneReport {
  removedPending: number;
  removedProposedMd: number;
  removedRejected: number;
  removedApplied: number;
  renamedActive: number;
  dedupedTrajectories: number;
  details: string[];
}

async function readJsonDir<T>(dir: string): Promise<Array<{ file: string; value: T }>> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const out: Array<{ file: string; value: T }> = [];
  for (const file of entries.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = await readFile(join(dir, file), "utf-8");
      out.push({ file, value: JSON.parse(raw) as T });
    } catch {
      continue;
    }
  }
  return out;
}

function proposalKey(proposal: SkillProposal): string {
  return canonicalSkillKey(proposal.payload.name || proposal.skillId);
}

function shouldRemoveProposal(
  proposal: SkillProposal,
  activeKeys: Set<string>,
  seenKeys: Set<string>
): boolean {
  const key = proposalKey(proposal);
  if (isNoiseSkillIdentity(proposal.skillId) || isNoiseSkillIdentity(proposal.payload.name)) {
    return true;
  }
  if (activeKeys.has(key) && proposal.action === "create") {
    return true;
  }
  if (seenKeys.has(key)) {
    return true;
  }
  return false;
}

async function pruneProposalDir(
  dir: string,
  activeKeys: Set<string>,
  label: string
): Promise<{ removed: number; details: string[] }> {
  const records = await readJsonDir<SkillProposal>(dir);
  let removed = 0;
  const details: string[] = [];
  const seenKeys = new Set<string>();

  for (const { file, value } of records.sort((a, b) => b.value.confidence - a.value.confidence)) {
    const remove = shouldRemoveProposal(value, activeKeys, seenKeys);
    if (remove) {
      await rm(join(dir, file), { force: true });
      removed++;
      details.push(`${label}: removed ${value.skillId} (${file})`);
      continue;
    }
    seenKeys.add(proposalKey(value));
  }
  return { removed, details };
}

function buildActiveSkillKeys(active: Skill[]): Set<string> {
  const keys = new Set<string>();
  for (const skill of active) {
    keys.add(canonicalSkillKey(skill.id));
    keys.add(canonicalSkillKey(skill.name || skill.id));
  }
  return keys;
}

function shouldRemoveProposedSkill(
  skill: Skill,
  activeKeys: Set<string>,
  keptProposedKeys: Set<string>
): boolean {
  const keys = [canonicalSkillKey(skill.id), canonicalSkillKey(skill.name || skill.id)];
  if (isNoiseSkillIdentity(skill.id) || isNoiseSkillIdentity(skill.name)) {
    return true;
  }
  for (const key of keys) {
    if (activeKeys.has(key) || matchesAnyActiveSkillKey(key, activeKeys)) {
      return true;
    }
    for (const kept of keptProposedKeys) {
      if (isNearDuplicateSkillKey(key, kept)) {
        return true;
      }
    }
  }
  return false;
}

async function pruneProposedMarkdown(
  paths: SkillPaths,
  activeKeys: Set<string>
): Promise<{ removed: number; details: string[] }> {
  let entries: string[] = [];
  try {
    entries = await readdir(paths.proposedDir);
  } catch {
    return { removed: 0, details: [] };
  }

  let removed = 0;
  const details: string[] = [];
  const keptProposedKeys = new Set<string>();

  for (const file of entries.filter((name) => name.endsWith(".md"))) {
    const skillId = file.replace(/\.md$/, "");
    let skill: Skill | undefined;
    try {
      const content = await readFile(join(paths.proposedDir, file), "utf-8");
      skill = parseSkill(content).skill;
    } catch {
      skill = undefined;
    }

    const remove = !skill || shouldRemoveProposedSkill(skill, activeKeys, keptProposedKeys);

    if (remove) {
      await rm(join(paths.proposedDir, file), { force: true });
      removed++;
      details.push(`proposed-md: removed ${file}`);
      continue;
    }

    keptProposedKeys.add(canonicalSkillKey(skill.name || skill.id));
    keptProposedKeys.add(canonicalSkillKey(skill.id));
  }
  return { removed, details };
}

async function normalizeActiveSkills(paths: SkillPaths): Promise<{ renamed: number; details: string[] }> {
  const active = await readSkillDirectory(paths.activeDir);
  let renamed = 0;
  const details: string[] = [];
  const registry = await readRegistry(paths);
  const nextActive: string[] = [];
  const nextSkills = registry.skills.filter((entry) => entry.status !== "active");

  for (const skill of active) {
    const cleanId = canonicalSkillKey(skill.name || skill.id);
    const cleanName = formatSkillDisplayName(skill.name || skill.id);
    const needsRename = isNoiseSkillIdentity(skill.id) || isNoiseSkillIdentity(skill.name);

    if (needsRename && !isNoiseSkillIdentity(cleanId)) {
      const normalized: Skill = {
        ...skill,
        id: cleanId,
        name: cleanName,
        status: "active",
      };
      const oldPath = join(paths.activeDir, `${skill.id}.md`);
      const newPath = join(paths.activeDir, `${cleanId}.md`);
      if (skill.id !== cleanId) {
        await rm(oldPath, { force: true });
      }
      await writeFile(newPath, serializeSkill(normalized), "utf-8");
      renamed++;
      details.push(`active: renamed ${skill.id} → ${cleanId}`);
      nextActive.push(cleanId);
      nextSkills.push({
        id: cleanId,
        name: cleanName,
        status: "active",
        harnesses: normalized.harnesses,
        tags: normalized.tags,
        metrics: normalized.metrics,
      });
      continue;
    }

    if (isNoiseSkillIdentity(skill.id)) {
      await rm(join(paths.activeDir, `${skill.id}.md`), { force: true });
      details.push(`active: removed noisy ${skill.id}`);
      continue;
    }

    nextActive.push(skill.id);
    nextSkills.push({
      id: skill.id,
      name: formatSkillDisplayName(skill.name),
      status: "active",
      harnesses: skill.harnesses,
      tags: skill.tags,
      metrics: skill.metrics,
    });
  }

  registry.active = [...new Set(nextActive)];
  registry.skills = nextSkills;
  await writeFile(paths.registryPath, JSON.stringify(registry, null, 2), "utf-8");
  return { renamed, details };
}

/** Collapse duplicate cli-mine uploads; keep one event stream per sessionId. */
async function dedupeTrajectoryUploads(trajectoryDir: string): Promise<{ removed: number; details: string[] }> {
  let entries: string[] = [];
  try {
    entries = await readdir(trajectoryDir);
  } catch {
    return { removed: 0, details: [] };
  }

  const jsonlFiles = entries.filter((name) => name.endsWith(".jsonl"));
  const sessionEvents = new Map<string, Map<number, string>>();
  const cliMineFiles: string[] = [];

  for (const file of jsonlFiles) {
    if (file.startsWith("cli-mine-")) cliMineFiles.push(file);
    const raw = await readFile(join(trajectoryDir, file), "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line) as {
          sessionId?: string;
          sequence?: number;
          metadata?: { sourceKind?: string };
        };
        if (!event.sessionId) continue;
        if (event.metadata?.sourceKind === "skill" || event.metadata?.sourceKind === "document") continue;
        if (event.sessionId.startsWith("skill-") || event.sessionId.startsWith("doc-")) continue;
        const bucket = sessionEvents.get(event.sessionId) ?? new Map<number, string>();
        bucket.set(event.sequence ?? bucket.size, line);
        sessionEvents.set(event.sessionId, bucket);
      } catch {
        continue;
      }
    }
  }

  let removed = 0;
  const details: string[] = [];
  if (cliMineFiles.length > 1) {
    for (const file of cliMineFiles) {
      await rm(join(trajectoryDir, file), { force: true });
      removed++;
    }
    details.push(`trajectories: removed ${cliMineFiles.length} duplicate cli-mine uploads`);
  }

  if (sessionEvents.size > 0) {
    const merged: string[] = [];
    for (const [, events] of sessionEvents) {
      merged.push(...[...events.entries()].sort((a, b) => a[0] - b[0]).map(([, line]) => line));
    }
    await writeFile(join(trajectoryDir, "merged-sessions.jsonl"), `${merged.join("\n")}\n`, "utf-8");
    details.push(`trajectories: merged ${sessionEvents.size} session(s) into merged-sessions.jsonl`);
  }

  return { removed, details };
}

/** Remove duplicate/noisy proposals, normalize active skill ids, dedupe trajectory uploads. */
export async function pruneWorkspaceDuplicates(paths: SkillPaths, actor = "system"): Promise<PruneReport> {
  const active = await readSkillDirectory(paths.activeDir);
  const activeKeys = buildActiveSkillKeys(active);
  const details: string[] = [];

  const pending = await pruneProposalDir(paths.registryProposedDir, activeKeys, "pending");
  details.push(...pending.details);

  const rejected = await pruneProposalDir(paths.registryRejectedDir, activeKeys, "rejected");
  details.push(...rejected.details);

  const applied = await pruneProposalDir(paths.registryAppliedDir, activeKeys, "applied");
  details.push(...applied.details);

  const proposedMd = await pruneProposedMarkdown(paths, activeKeys);
  details.push(...proposedMd.details);

  const normalized = await normalizeActiveSkills(paths);
  details.push(...normalized.details);

  const trajectories = await dedupeTrajectoryUploads(paths.trajectoriesDir);
  details.push(...trajectories.details);

  await appendAudit(paths, {
    action: "maintenance.prune",
    actor,
    resourceType: "workspace",
    note: `Pruned duplicates (${pending.removed + rejected.removed + applied.removed} proposals)`,
  });

  return {
    removedPending: pending.removed,
    removedProposedMd: proposedMd.removed,
    removedRejected: rejected.removed,
    removedApplied: applied.removed,
    renamedActive: normalized.renamed,
    dedupedTrajectories: trajectories.removed,
    details,
  };
}

export async function runWorkspacePrune(actor?: string): Promise<PruneReport> {
  const paths = await resolveSkillPaths();
  return pruneWorkspaceDuplicates(paths, actor);
}

export interface AllWorkspacesPruneReport {
  workspaces: number;
  totals: PruneReport;
  byWorkspace: Array<{ workspaceId: string; slug: string; name: string; report: PruneReport }>;
}

/** Run duplicate cleanup for every workspace on the instance (admin / scheduler). */
export async function runAllWorkspacesPrune(actor = "system:maintenance"): Promise<AllWorkspacesPruneReport> {
  const workspaces = await listWorkspaces();
  const byWorkspace: AllWorkspacesPruneReport["byWorkspace"] = [];
  const totals: PruneReport = {
    removedPending: 0,
    removedProposedMd: 0,
    removedRejected: 0,
    removedApplied: 0,
    renamedActive: 0,
    dedupedTrajectories: 0,
    details: [],
  };

  for (const workspace of workspaces) {
    const paths = await resolveSkillPathsForRoot(workspace.storagePath);
    const report = await pruneWorkspaceDuplicates(paths, `${actor}:${workspace.slug}`);
    byWorkspace.push({
      workspaceId: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      report,
    });
    totals.removedPending += report.removedPending;
    totals.removedProposedMd += report.removedProposedMd;
    totals.removedRejected += report.removedRejected;
    totals.removedApplied += report.removedApplied;
    totals.renamedActive += report.renamedActive;
    totals.dedupedTrajectories += report.dedupedTrajectories;
    totals.details.push(
      ...report.details.map((line) => `${workspace.slug}: ${line}`)
    );
  }

  return { workspaces: workspaces.length, totals, byWorkspace };
}
