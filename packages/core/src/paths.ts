import { existsSync, readdirSync, statSync } from "node:fs";
import { access, appendFile, cp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PROJECT_DATA_DIRNAME = ".runcanon";
export const LEGACY_PROJECT_DATA_DIRNAME = ".skillsmith";

export const DEFAULT_TRAJECTORY_STORAGE = `${PROJECT_DATA_DIRNAME}/trajectories`;

export const LEGACY_USER_CONFIG_DIR = ".skillsmith";
export const USER_CONFIG_DIR = ".runcanon";

/** Default on-disk project data directory (prefers .runcanon). */
export function defaultProjectDataDir(projectPath: string): string {
  return join(projectPath, PROJECT_DATA_DIRNAME);
}

function scoreDataDirSync(dir: string): number {
  let score = 0;
  for (const sub of ["trajectories", "skills", "registry"]) {
    const subPath = join(dir, sub);
    if (!existsSync(subPath)) continue;
    try {
      const walk = (root: string): number => {
        let count = 0;
        for (const entry of readdirSync(root)) {
          const full = join(root, entry);
          if (statSync(full).isDirectory()) count += walk(full);
          else count++;
        }
        return count;
      };
      score += walk(subPath);
    } catch {
      // ignore unreadable dirs
    }
  }
  if (existsSync(join(dir, "skills-index.json"))) score += 10;
  return score;
}

async function scoreDataDir(dir: string): Promise<number> {
  let score = 0;
  for (const sub of ["trajectories", "skills", "registry"]) {
    const subPath = join(dir, sub);
    try {
      await access(subPath);
    } catch {
      continue;
    }
    const walk = async (root: string): Promise<number> => {
      let count = 0;
      let entries: string[] = [];
      try {
        entries = await readdir(root);
      } catch {
        return 0;
      }
      for (const entry of entries) {
        const full = join(root, entry);
        try {
          if ((await stat(full)).isDirectory()) count += await walk(full);
          else count++;
        } catch {
          // skip
        }
      }
      return count;
    };
    score += await walk(subPath);
  }
  try {
    await access(join(dir, "skills-index.json"));
    score += 10;
  } catch {
    // no index
  }
  return score;
}

async function pickProjectDataDir(projectPath: string): Promise<string> {
  const candidates: string[] = [];
  for (const dir of [PROJECT_DATA_DIRNAME, LEGACY_PROJECT_DATA_DIRNAME]) {
    const candidate = join(projectPath, dir);
    try {
      await access(candidate);
      candidates.push(candidate);
    } catch {
      // not present
    }
  }
  if (candidates.length === 0) return defaultProjectDataDir(projectPath);
  if (candidates.length === 1) return candidates[0]!;

  const scores = await Promise.all(candidates.map((dir) => scoreDataDir(dir)));
  const bestIndex = scores.indexOf(Math.max(...scores));
  return candidates[bestIndex] ?? candidates[0]!;
}

function pickProjectDataDirSync(projectPath: string): string {
  const candidates: string[] = [];
  for (const dir of [PROJECT_DATA_DIRNAME, LEGACY_PROJECT_DATA_DIRNAME]) {
    const candidate = join(projectPath, dir);
    if (existsSync(candidate)) candidates.push(candidate);
  }
  if (candidates.length === 0) return defaultProjectDataDir(projectPath);
  if (candidates.length === 1) return candidates[0]!;

  const scores = candidates.map((dir) => scoreDataDirSync(dir));
  const bestIndex = scores.indexOf(Math.max(...scores));
  return candidates[bestIndex] ?? candidates[0]!;
}

/** Sync variant for callers that cannot await (e.g. MCP path helpers). */
export function resolveProjectDataDirSync(projectPath: string): string {
  return pickProjectDataDirSync(projectPath);
}

/** Resolve existing project data directory (.runcanon or legacy .skillsmith). */
export async function resolveProjectDataDir(projectPath: string): Promise<string> {
  await migrateLegacyProjectDataDir(projectPath);
  return pickProjectDataDir(projectPath);
}

const MIGRATION_MARKER = ".migrated-from-skillsmith";

/**
 * One-time migration: move legacy `.skillsmith/` workspace data into `.runcanon/` and remove the old dir.
 * Safe to call repeatedly (no-op after migration).
 */
export async function migrateLegacyProjectDataDir(projectPath: string): Promise<boolean> {
  const legacyPath = join(projectPath, LEGACY_PROJECT_DATA_DIRNAME);
  const modernPath = join(projectPath, PROJECT_DATA_DIRNAME);

  try {
    await access(legacyPath);
  } catch {
    return false;
  }

  await mkdirSafe(modernPath);

  const markerPath = join(modernPath, MIGRATION_MARKER);
  let alreadyMigrated = false;
  try {
    await access(markerPath);
    alreadyMigrated = true;
  } catch {
    // first migration
  }

  if (!alreadyMigrated) {
    const entries = await readdir(legacyPath, { withFileTypes: true });
    for (const entry of entries) {
      const src = join(legacyPath, entry.name);
      const dest = join(modernPath, entry.name);
      if (entry.name === MIGRATION_MARKER) continue;

      if (entry.isDirectory()) {
        await cp(src, dest, { recursive: true, force: true });
        continue;
      }

      if (entry.name === "audit.jsonl") {
        try {
          const legacyAudit = await readFile(src, "utf-8");
          if (legacyAudit.trim()) {
            await appendFile(dest, legacyAudit.endsWith("\n") ? legacyAudit : `${legacyAudit}\n`, "utf-8");
          }
        } catch {
          await cp(src, dest, { force: true });
        }
        continue;
      }

      try {
        await access(dest);
      } catch {
        await cp(src, dest, { force: true });
      }
    }

    await writeFile(markerPath, new Date().toISOString(), "utf-8");
  }

  await rm(legacyPath, { recursive: true, force: true });
  return true;
}

async function mkdirSafe(dir: string): Promise<void> {
  try {
    await access(dir);
  } catch {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }
}
