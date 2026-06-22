import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { LEGACY_USER_CONFIG_DIR, USER_CONFIG_DIR } from "@runcanon/core";

export interface ProjectPathState {
  projectPath: string;
  updatedAt: string;
  /** Optional extra mining source paths (files or directories). */
  miningSources?: string[];
}

async function resolveStateDir(): Promise<string> {
  if (process.env.RUNCANON_STATE_DIR) {
    return process.env.RUNCANON_STATE_DIR;
  }
  const primary = join(homedir(), USER_CONFIG_DIR);
  try {
    await access(join(primary, "active-project.json"));
    return primary;
  } catch {
    const legacy = join(homedir(), LEGACY_USER_CONFIG_DIR);
    try {
      await access(join(legacy, "active-project.json"));
      return legacy;
    } catch {
      return primary;
    }
  }
}

function stateFilePath(stateDir: string): string {
  return join(stateDir, "active-project.json");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readProjectPathState(): Promise<ProjectPathState | undefined> {
  try {
    const stateDir = await resolveStateDir();
    const raw = await readFile(stateFilePath(stateDir), "utf-8");
    return JSON.parse(raw) as ProjectPathState;
  } catch {
    return undefined;
  }
}

export async function writeProjectPathState(state: Omit<ProjectPathState, "updatedAt">): Promise<ProjectPathState> {
  const stateDir = process.env.RUNCANON_STATE_DIR ?? join(homedir(), USER_CONFIG_DIR);
  await mkdir(stateDir, { recursive: true });
  const record: ProjectPathState = {
    ...state,
    projectPath: resolve(state.projectPath),
    updatedAt: new Date().toISOString(),
  };
  await writeFile(stateFilePath(stateDir), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

import { resolveActiveProjectRoot } from "./platform.js";

/** Resolve the active RunCanon project root. */
export async function resolveActiveProjectPath(override?: string): Promise<string> {
  if (override) {
    return resolve(override);
  }
  if (process.env.RUNCANON_PROJECT_PATH) {
    return resolve(process.env.RUNCANON_PROJECT_PATH);
  }
  return resolveActiveProjectRoot();
}

export async function validateProjectPath(projectPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = resolve(projectPath);
  try {
    const { stat } = await import("node:fs/promises");
    const info = await stat(resolved);
    if (!info.isDirectory()) {
      return { ok: false, error: "Path must be a directory" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Directory does not exist or is not accessible" };
  }
}
