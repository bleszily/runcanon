import { access, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  isKnownHarness,
  renderProjectInstructions,
  renderSkill,
  type Harness,
  type Skill,
} from "@runcanon/spec";

/** Default harnesses for multi-target sync (Cursor, Claude, Codex, Antigravity, Copilot). */
export const DEFAULT_SYNC_HARNESSES: Harness[] = ["cursor", "claude", "codex", "antigravity", "copilot"];

/** Relative skill directory roots per harness (used for pruning stale exports). */
export const HARNESS_SKILL_ROOTS: Record<string, string[]> = {
  cursor: [".cursor/skills", ".cursor/rules"],
  claude: [".claude/skills"],
  codex: [".codex/skills"],
  openai: [".codex/skills"],
  antigravity: [".agents/skills"],
  copilot: [".github/instructions"],
  continue: [".continue/skills", ".continue/rules"],
  windsurf: [".windsurf/rules"],
  browser: ["skills"],
  coworker: ["skills"],
  browseros: ["skills"],
  gemini: [".gemini/skills"],
  aider: [".aider/skills"],
  zed: [".zed/skills"],
};

export interface ProjectExportOptions {
  projectRoot: string;
  skills: Skill[];
  harnesses: Harness[];
  /** When true, replace existing harness files for exported skills. */
  overwrite?: boolean;
  /** Remove skill dirs under harness roots that are not in the export set. */
  prune?: boolean;
  /** Include AGENTS.md / CLAUDE.md etc. */
  includeProjectInstructions?: boolean;
}

export interface ProjectExportResult {
  harnesses: string[];
  skillCount: number;
  filesWritten: number;
  paths: string[];
  skipped: string[];
  pruned: string[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listSubdirs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Write skills to harness-native paths under a project root (Cursor, Claude, Codex, etc.). */
export async function writeSkillsToProject(input: ProjectExportOptions): Promise<ProjectExportResult> {
  const harnesses = input.harnesses.filter((h) => isKnownHarness(h));
  if (harnesses.length === 0) {
    throw new Error("No valid harnesses specified");
  }

  const root = resolve(input.projectRoot);
  const skillIds = new Set(input.skills.map((s) => s.id));
  const prepared = input.skills.map((skill) => ({
    ...skill,
    harnesses: skill.harnesses?.length ? skill.harnesses : harnesses,
  }));

  let filesWritten = 0;
  const writtenPaths: string[] = [];
  const skipped: string[] = [];
  const pruned: string[] = [];

  const renderedSkills = prepared.flatMap((skill) => renderSkill(skill));
  for (const { path, content, overwrite } of renderedSkills) {
    const fullPath = resolve(root, path);
    await mkdir(resolve(fullPath, ".."), { recursive: true });
    const mayWrite = input.overwrite !== false || overwrite || !(await fileExists(fullPath));
    if (!mayWrite) {
      skipped.push(path);
      continue;
    }
    await writeFile(fullPath, content, "utf-8");
    filesWritten++;
    writtenPaths.push(path);
  }

  if (input.includeProjectInstructions !== false && prepared.length > 0) {
    for (const { path, content, overwrite } of renderProjectInstructions(prepared)) {
      const fullPath = resolve(root, path);
      await mkdir(resolve(fullPath, ".."), { recursive: true });
      const mayWrite = input.overwrite !== false || overwrite || !(await fileExists(fullPath));
      if (!mayWrite) {
        skipped.push(path);
        continue;
      }
      await writeFile(fullPath, content, "utf-8");
      filesWritten++;
      writtenPaths.push(path);
    }
  }

  if (input.prune) {
    for (const harness of harnesses) {
      const roots = HARNESS_SKILL_ROOTS[harness] ?? [];
      for (const relRoot of roots) {
        if (!relRoot.endsWith("/skills") && !relRoot.includes("/skills")) continue;
        const absRoot = join(root, relRoot);
        for (const subdir of await listSubdirs(absRoot)) {
          if (!skillIds.has(subdir)) {
            const target = join(absRoot, subdir);
            await rm(target, { recursive: true, force: true });
            pruned.push(target);
          }
        }
      }
    }
  }

  return {
    harnesses,
    skillCount: prepared.length,
    filesWritten,
    paths: writtenPaths,
    skipped,
    pruned,
  };
}
