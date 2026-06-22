import { readdir, readFile, rename, writeFile, mkdir, rm } from "node:fs/promises";
import { join, parse as parsePath, resolve } from "node:path";

import { parseSkill, serializeSkill, type Skill, type SkillProposal, type SkillRegistryIndex } from "@runcanon/spec";
import { getActiveWorkspaceForUser } from "@runcanon/platform";
import { resolveProjectDataDir } from "@runcanon/core";

import { resolveActiveProjectPath } from "./project-path.js";
import { resolveRequestUserId } from "./request-auth.js";

/** Paths derived from a RunCanon project root. */
export interface SkillPaths {
  projectPath: string;
  dataDir: string;
  skillsDir: string;
  activeDir: string;
  proposedDir: string;
  retiredDir: string;
  registryPath: string;
  registryProposedDir: string;
  registryRejectedDir: string;
  registryAppliedDir: string;
  trajectoriesDir: string;
  configPath: string;
}

async function buildSkillPaths(root: string): Promise<SkillPaths> {
  const baseDir = await resolveProjectDataDir(root);
  const skillsDir = join(baseDir, "skills");
  const registryDir = join(baseDir, "registry");
  return {
    projectPath: root,
    dataDir: baseDir,
    skillsDir,
    activeDir: join(skillsDir, "active"),
    proposedDir: join(skillsDir, "proposed"),
    retiredDir: join(skillsDir, "retired"),
    registryPath: join(baseDir, "skills-index.json"),
    registryProposedDir: join(registryDir, "proposed"),
    registryRejectedDir: join(registryDir, "rejected"),
    registryAppliedDir: join(registryDir, "applied"),
    trajectoriesDir: join(baseDir, "trajectories"),
    configPath: join(root, "runcanon.config.yaml"),
  };
}

/** Resolve skill paths for an explicit project or workspace storage root. */
export async function resolveSkillPathsForRoot(projectRoot: string): Promise<SkillPaths> {
  return buildSkillPaths(resolve(projectRoot));
}

/** Resolve RunCanon project paths from override, signed-in workspace, env, or legacy default. */
export async function resolveSkillPaths(projectPath?: string): Promise<SkillPaths> {
  if (projectPath) {
    return buildSkillPaths(resolve(projectPath));
  }

  // Authenticated dashboard/API requests use per-user workspace storage on the server.
  const { userId, isAdmin } = resolveRequestUserId();
  if (userId) {
    const workspace = await getActiveWorkspaceForUser(userId, isAdmin);
    if (workspace) {
      return buildSkillPaths(workspace.storagePath);
    }
  }

  if (process.env.RUNCANON_PROJECT_PATH) {
    return buildSkillPaths(resolve(process.env.RUNCANON_PROJECT_PATH));
  }

  const root = await resolveActiveProjectPath();
  return buildSkillPaths(root);
}

/** Read the skill registry index if it exists; otherwise return an empty index. */
export async function readRegistry(paths: SkillPaths): Promise<SkillRegistryIndex> {
  try {
    const raw = await readFile(paths.registryPath, "utf-8");
    return JSON.parse(raw) as SkillRegistryIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        schemaVersion: "1.0.0",
        generatedAt: new Date().toISOString(),
        active: [],
        draft: [],
        retired: [],
        skills: [],
      };
    }
    throw error;
  }
}

/** Read all canonical skill markdown files from a directory. */
export async function readSkillDirectory(dir: string): Promise<Skill[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const skills: Skill[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".md"))) {
    try {
      const content = await readFile(join(dir, entry), "utf-8");
      const { skill } = parseSkill(content);
      skills.push(skill);
    } catch {
      // Skip malformed skill files gracefully.
      continue;
    }
  }
  return skills;
}

/** Find a skill by id across active, proposed, and retired directories. */
export async function findSkillById(paths: SkillPaths, skillId: string): Promise<Skill | undefined> {
  for (const dir of [paths.activeDir, paths.proposedDir, paths.retiredDir]) {
    try {
      const content = await readFile(join(dir, `${skillId}.md`), "utf-8");
      const { skill } = parseSkill(content);
      return skill;
    } catch {
      continue;
    }
  }
  return undefined;
}

/** Read active, proposed, and retired skills from the project. */
export async function listSkills(paths: SkillPaths): Promise<{ active: Skill[]; proposed: Skill[]; retired: Skill[] }> {
  const [activeRaw, proposed] = await Promise.all([
    readSkillDirectory(paths.activeDir),
    readSkillDirectory(paths.proposedDir),
  ]);
  const retiredFromActive = await readSkillDirectory(paths.retiredDir);

  const active: Skill[] = [];
  const retired: Skill[] = [...retiredFromActive];

  for (const skill of activeRaw) {
    if (skill.status === "retired" || skill.status === "deprecated") {
      retired.push(skill);
    } else {
      active.push({ ...skill, status: skill.status === "draft" ? "proposed" : "active" });
    }
  }

  return { active, proposed, retired };
}

/** Read proposal records from the registry proposed directory. */
export async function readProposalRecords(paths: SkillPaths): Promise<SkillProposal[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(paths.registryProposedDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const proposals: SkillProposal[] = [];
  for (const entry of entries.filter((name) => name.endsWith(".json"))) {
    try {
      const raw = await readFile(join(paths.registryProposedDir, entry), "utf-8");
      const proposal = JSON.parse(raw) as SkillProposal;
      proposals.push(proposal);
    } catch {
      continue;
    }
  }
  return proposals;
}

/**
 * Read proposals from the registry proposed directory, enriched with the current
 * active skill (when the proposal is an update) and the previous skill version.
 */
export async function listProposals(
  paths: SkillPaths
): Promise<Array<SkillProposal & { activeSkill?: Skill; previous?: Skill }>> {
  const [proposals, activeSkills] = await Promise.all([readProposalRecords(paths), readSkillDirectory(paths.activeDir)]);
  const activeById = new Map(activeSkills.map((skill) => [skill.id, skill]));

  return proposals.map((proposal) => ({
    ...proposal,
    activeSkill: activeById.get(proposal.skillId),
    previous: proposal.previous,
  }));
}

/** Find a proposal record by id. */
export async function findProposal(
  paths: SkillPaths,
  proposalId: string
): Promise<{ proposal: SkillProposal; filePath: string } | undefined> {
  const proposals = await readProposalRecords(paths);
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return undefined;

  return {
    proposal,
    filePath: join(paths.registryProposedDir, `${proposal.skillId}.json`),
  };
}

/**
 * Approve a proposal by moving its skill file from `proposed` to `active` and
 * updating the registry index.
 */
export async function approveProposal(paths: SkillPaths, proposalId: string): Promise<Skill | undefined> {
  const found = await findProposal(paths, proposalId);
  if (!found) return undefined;

  const { proposal } = found;
  const skill = { ...proposal.payload, status: "active" as const };
  const sourcePath = join(paths.proposedDir, `${skill.id}.md`);
  const targetPath = join(paths.activeDir, `${skill.id}.md`);

  // Ensure directories exist.
  await mkdir(paths.activeDir, { recursive: true });
  await mkdir(paths.proposedDir, { recursive: true });

  try {
    await rm(sourcePath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await writeFile(targetPath, serializeSkill(skill), "utf-8");

  const registry = await readRegistry(paths);
  registry.active = [...new Set([...registry.active, skill.id])];
  registry.draft = registry.draft.filter((id) => id !== skill.id);
  const existingIndex = registry.skills.findIndex((s) => s.id === skill.id);
  if (existingIndex >= 0) {
    registry.skills[existingIndex] = {
      id: skill.id,
      name: skill.name,
      status: "active",
      harnesses: skill.harnesses,
      tags: skill.tags,
      metrics: skill.metrics,
    };
  } else {
    registry.skills.push({
      id: skill.id,
      name: skill.name,
      status: "active",
      harnesses: skill.harnesses,
      tags: skill.tags,
      metrics: skill.metrics,
    });
  }
  await writeFile(paths.registryPath, JSON.stringify(registry, null, 2), "utf-8");

  // Archive approved proposal for dashboard history, then remove from pending queue.
  await mkdir(paths.registryAppliedDir, { recursive: true });
  const applied: SkillProposal = {
    ...found.proposal,
    metadata: {
      ...found.proposal.metadata,
      appliedAt: new Date().toISOString(),
    },
  };
  await writeFile(
    join(paths.registryAppliedDir, `${proposal.skillId}.json`),
    JSON.stringify(applied, null, 2),
    "utf-8"
  );

  try {
    await rm(found.filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  const proposedSkillPath = join(paths.proposedDir, `${skill.id}.md`);
  try {
    await rm(proposedSkillPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return skill;
}

/**
 * Reject a proposal by moving its registry record to the `registry/rejected`
 * directory and recording the rejection timestamp in metadata.
 */
export async function rejectProposal(paths: SkillPaths, proposalId: string): Promise<SkillProposal | undefined> {
  const found = await findProposal(paths, proposalId);
  if (!found) return undefined;

  await mkdir(paths.registryRejectedDir, { recursive: true });
  const rejectedPath = join(paths.registryRejectedDir, parsePath(found.filePath).base);
  const rejected: SkillProposal = {
    ...found.proposal,
    metadata: {
      ...found.proposal.metadata,
      rejectedAt: new Date().toISOString(),
    },
  };

  await writeFile(rejectedPath, JSON.stringify(rejected, null, 2), "utf-8");
  try {
    await rm(found.filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  return rejected;
}

/** Retire an active skill by moving it to the retired directory. */
export async function retireSkill(paths: SkillPaths, skillId: string): Promise<Skill | undefined> {
  const activePath = join(paths.activeDir, `${skillId}.md`);
  let skill: Skill;
  try {
    const content = await readFile(activePath, "utf-8");
    skill = parseSkill(content).skill;
  } catch {
    return undefined;
  }

  const retired = { ...skill, status: "retired" as const, version: skill.version + 1 };
  await mkdir(paths.retiredDir, { recursive: true });
  await writeFile(join(paths.retiredDir, `${skillId}.md`), serializeSkill(retired), "utf-8");
  await rm(activePath, { force: true });

  const registry = await readRegistry(paths);
  registry.active = registry.active.filter((id) => id !== skillId);
  if (!registry.retired.includes(skillId)) registry.retired.push(skillId);
  const idx = registry.skills.findIndex((s) => s.id === skillId);
  if (idx >= 0) {
    registry.skills[idx] = { ...registry.skills[idx], status: "retired" };
  } else {
    registry.skills.push({
      id: skillId,
      name: retired.name,
      status: "retired",
      harnesses: retired.harnesses,
      tags: retired.tags,
      metrics: retired.metrics,
    });
  }
  await writeFile(paths.registryPath, JSON.stringify(registry, null, 2), "utf-8");
  return retired;
}

function defaultSkillMetrics(): Skill["metrics"] {
  const now = new Date().toISOString();
  return {
    frequency: 0,
    successRate: 0,
    failureRate: 0,
    weaknessScore: 0,
    stalenessScore: 0,
    importanceScore: 0.5,
    generatedAt: now,
    sampleSize: 0,
  };
}

/** Create or replace an active workspace skill on disk and update the registry index. */
export async function upsertActiveSkill(paths: SkillPaths, skill: Skill): Promise<Skill> {
  const active = { ...skill, status: "active" as const };
  await mkdir(paths.activeDir, { recursive: true });
  await writeFile(join(paths.activeDir, `${active.id}.md`), serializeSkill(active), "utf-8");

  const registry = await readRegistry(paths);
  if (!registry.active.includes(active.id)) {
    registry.active.push(active.id);
  }
  registry.draft = registry.draft.filter((id) => id !== active.id);
  const summary = {
    id: active.id,
    name: active.name,
    status: "active" as const,
    harnesses: active.harnesses,
    tags: active.tags,
    metrics: active.metrics,
  };
  const idx = registry.skills.findIndex((s) => s.id === active.id);
  if (idx >= 0) registry.skills[idx] = summary;
  else registry.skills.push(summary);

  registry.generatedAt = new Date().toISOString();
  await writeFile(paths.registryPath, JSON.stringify(registry, null, 2), "utf-8");
  return active;
}

/** Parse markdown and save as an active workspace skill. */
export async function saveSkillFromMarkdown(
  paths: SkillPaths,
  markdown: string,
  options?: { forceStatus?: Skill["status"] }
): Promise<Skill> {
  const { skill } = parseSkill(markdown);
  const normalized: Skill = {
    ...skill,
    status: options?.forceStatus ?? skill.status ?? "active",
    metrics: skill.metrics?.generatedAt ? skill.metrics : defaultSkillMetrics(),
  };
  if (normalized.status === "active") {
    return upsertActiveSkill(paths, normalized);
  }

  await mkdir(paths.proposedDir, { recursive: true });
  await writeFile(join(paths.proposedDir, `${normalized.id}.md`), serializeSkill(normalized), "utf-8");
  return normalized;
}
