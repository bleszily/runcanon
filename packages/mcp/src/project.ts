import { resolve, join, dirname } from "node:path";
import { readdir, readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";

import {
  loadConfig,
  mineSkills,
  computeGoalAlignment,
  segmentTrajectory,
  resolveProjectDataDirSync,
  saveConfig,
  type MiningOptions,
} from "@runcanon/core";
import {
  parseSkill,
  serializeSkill,
  renderSkill,
  renderProjectInstructions,
  isKnownHarness,
  type Skill,
  type SkillProposal,
  type TrajectoryEvent,
  type Harness,
} from "@runcanon/spec";
import { Collector } from "@runcanon/telemetry";

/** RunCanon project paths (shared by MCP server and CLI). */
export interface ProjectPaths {
  root: string;
  configPath: string;
  skillsDir: string;
  activeDir: string;
  proposedDir: string;
  registryPath: string;
  registryProposedDir: string;
  registryRejectedDir: string;
  trajectoriesDir: string;
}

export function resolveProjectRoot(projectPath?: string): string {
  return resolve(projectPath ?? process.env.RUNCANON_PROJECT_PATH ?? process.cwd());
}

export function resolveProjectPaths(projectPath?: string): ProjectPaths {
  const root = resolveProjectRoot(projectPath);
  const dataDir = resolveProjectDataDirSync(root);
  const skillsDir = join(dataDir, "skills");
  const registryDir = join(dataDir, "registry");
  return {
    root,
    configPath: join(root, "runcanon.config.yaml"),
    skillsDir,
    activeDir: join(skillsDir, "active"),
    proposedDir: join(skillsDir, "proposed"),
    registryPath: join(dataDir, "skills-index.json"),
    registryProposedDir: join(registryDir, "proposed"),
    registryRejectedDir: join(registryDir, "rejected"),
    trajectoriesDir: join(dataDir, "trajectories"),
  };
}

async function readSkillDir(dir: string): Promise<Skill[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const skills: Skill[] = [];
  for (const entry of entries.filter((n) => n.endsWith(".md"))) {
    try {
      const content = await readFile(join(dir, entry), "utf-8");
      skills.push(parseSkill(content).skill);
    } catch {
      continue;
    }
  }
  return skills;
}

export async function listProjectSkills(projectPath?: string): Promise<{ active: Skill[]; proposed: Skill[] }> {
  const paths = resolveProjectPaths(projectPath);
  const [active, proposed] = await Promise.all([readSkillDir(paths.activeDir), readSkillDir(paths.proposedDir)]);
  return { active, proposed };
}

export async function getProjectSkill(skillId: string, projectPath?: string): Promise<Skill | undefined> {
  const { active, proposed } = await listProjectSkills(projectPath);
  return [...active, ...proposed].find((s) => s.id === skillId);
}

export async function listProjectProposals(projectPath?: string): Promise<SkillProposal[]> {
  const paths = resolveProjectPaths(projectPath);
  let entries: string[] = [];
  try {
    entries = await readdir(paths.registryProposedDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const proposals: SkillProposal[] = [];
  for (const entry of entries.filter((n) => n.endsWith(".json"))) {
    try {
      const raw = await readFile(join(paths.registryProposedDir, entry), "utf-8");
      proposals.push(JSON.parse(raw) as SkillProposal);
    } catch {
      continue;
    }
  }
  return proposals;
}

export async function approveProjectProposal(proposalId: string, projectPath?: string): Promise<Skill | undefined> {
  const paths = resolveProjectPaths(projectPath);
  const proposals = await listProjectProposals(projectPath);
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return undefined;

  const skill = proposal.payload;
  await mkdir(paths.activeDir, { recursive: true });

  const sourcePath = join(paths.proposedDir, `${skill.id}.md`);
  const targetPath = join(paths.activeDir, `${skill.id}.md`);
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeFile(targetPath, serializeSkill(skill), "utf-8");
    } else {
      throw error;
    }
  }

  const proposalFile = join(paths.registryProposedDir, `${proposal.skillId}.json`);
  try {
    await rm(proposalFile);
  } catch {
    /* ignore */
  }

  return skill;
}

export async function rejectProjectProposal(proposalId: string, projectPath?: string): Promise<SkillProposal | undefined> {
  const paths = resolveProjectPaths(projectPath);
  const proposals = await listProjectProposals(projectPath);
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return undefined;

  await mkdir(paths.registryRejectedDir, { recursive: true });
  const rejectedPath = join(paths.registryRejectedDir, `${proposal.skillId}.json`);
  const rejected = {
    ...proposal,
    rejectedAt: new Date().toISOString(),
  };
  await writeFile(rejectedPath, JSON.stringify(rejected, null, 2), "utf-8");

  const proposalFile = join(paths.registryProposedDir, `${proposal.skillId}.json`);
  try {
    await rm(proposalFile);
  } catch {
    /* ignore */
  }

  return rejected;
}

export async function loadTrajectoryEvents(projectPath?: string): Promise<TrajectoryEvent[]> {
  const paths = resolveProjectPaths(projectPath);
  let files: string[] = [];
  try {
    files = await readdir(paths.trajectoriesDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const events: TrajectoryEvent[] = [];
  for (const file of files.filter((f) => f.endsWith(".jsonl"))) {
    const raw = await readFile(join(paths.trajectoriesDir, file), "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        events.push(JSON.parse(line) as TrajectoryEvent);
      } catch {
        continue;
      }
    }
  }
  return events.sort((a, b) => a.sequence - b.sequence);
}

export async function runProjectMine(projectPath?: string, options: MiningOptions = {}): Promise<SkillProposal[]> {
  const paths = resolveProjectPaths(projectPath);
  const config = await loadConfig(paths.root);
  const events = await loadTrajectoryEvents(paths.root);
  const { active } = await listProjectSkills(paths.root);
  const result = await mineSkills(events, active, {
    clustering: {
      minClusterSize: config.mining.minClusterSize,
      distanceThreshold: config.mining.distanceThreshold,
    },
    projectGoals: config.goals,
    ...options,
  });

  await mkdir(paths.proposedDir, { recursive: true });
  await mkdir(paths.registryProposedDir, { recursive: true });

  for (const proposal of result.proposals) {
    await writeFile(join(paths.proposedDir, `${proposal.payload.id}.md`), serializeSkill(proposal.payload), "utf-8");
    await writeFile(join(paths.registryProposedDir, `${proposal.skillId}.json`), JSON.stringify(proposal, null, 2), "utf-8");
  }

  return result.proposals;
}

async function writeExportFile(root: string, relativePath: string, content: string): Promise<void> {
  const fullPath = join(root, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

export async function exportProjectSkills(harnesses: Harness[], projectPath?: string): Promise<Array<{ path: string; content: string }>> {
  const paths = resolveProjectPaths(projectPath);
  const { active } = await listProjectSkills(paths.root);
  const targetSkills = active.map((s) => ({ ...s, harnesses }));
  const written: Array<{ path: string; content: string }> = [];

  for (const file of targetSkills.flatMap((s) => renderSkill(s))) {
    written.push({ path: file.path, content: file.content });
    await writeExportFile(paths.root, file.path, file.content);
  }

  for (const file of renderProjectInstructions(targetSkills)) {
    written.push({ path: file.path, content: file.content });
    await writeExportFile(paths.root, file.path, file.content);
  }

  return written;
}

export async function getProjectStats(projectPath?: string): Promise<{
  skillCount: number;
  proposalCount: number;
  trajectoryCount: number;
  goalAlignment: number;
}> {
  const paths = resolveProjectPaths(projectPath);
  const config = await loadConfig(paths.root);
  const [{ active, proposed }, proposals, events] = await Promise.all([
    listProjectSkills(paths.root),
    listProjectProposals(paths.root),
    loadTrajectoryEvents(paths.root),
  ]);

  const episodes = segmentTrajectory(events);

  const goalAlignment = computeGoalAlignment(episodes, config.goals);

  return {
    skillCount: active.length,
    proposalCount: proposals.length + proposed.length,
    trajectoryCount: new Set(events.map((e) => e.sessionId)).size,
    goalAlignment,
  };
}

export function createProjectCollector(projectPath?: string): Collector {
  const paths = resolveProjectPaths(projectPath);
  return new Collector({ storagePath: paths.trajectoriesDir });
}

export function validateHarnessList(harnesses: string[]): Harness[] {
  const invalid = harnesses.filter((h) => !isKnownHarness(h));
  if (invalid.length > 0) {
    throw new Error(`Unknown harness(es): ${invalid.join(", ")}`);
  }
  return harnesses as Harness[];
}

export function normalizeProjectGoals(input: string[]): string[] {
  const seen = new Set<string>();
  const goals: string[] = [];
  for (const raw of input) {
    const goal = raw.trim();
    if (!goal) continue;
    const key = goal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    goals.push(goal);
  }
  return goals;
}

export async function getProjectGoals(projectPath?: string): Promise<string[]> {
  const config = await loadConfig(resolveProjectPaths(projectPath).root);
  return config.goals;
}

export async function setProjectGoals(projectPath: string | undefined, goals: string[]): Promise<string[]> {
  const paths = resolveProjectPaths(projectPath);
  const config = await loadConfig(paths.root);
  config.goals = normalizeProjectGoals(goals);
  await saveConfig(paths.root, config);
  return config.goals;
}

export async function addProjectGoals(projectPath: string | undefined, goals: string[]): Promise<string[]> {
  const current = await getProjectGoals(projectPath);
  return setProjectGoals(projectPath, [...current, ...goals]);
}
