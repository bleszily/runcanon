import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import type { TrajectoryEvent } from "@runcanon/spec";

import { labelSourcePath, canonicalSkillKey } from "./path-labels.js";
import { LEGACY_PROJECT_DATA_DIRNAME, PROJECT_DATA_DIRNAME, resolveProjectDataDir } from "./paths.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".svelte-kit",
  ".turbo",
  "coverage",
  ".cursor",
  ".claude",
  ".github",
  ".runcanon",
]);

/** Harness export trees — never mine these as skill catalogs (they are outputs of export). */
function isHarnessExportPath(dirPath: string): boolean {
  const norm = dirPath.replace(/\\/g, "/").toLowerCase();
  return (
    norm.includes("/.cursor/") ||
    norm.includes("/.claude/") ||
    norm.endsWith("/.cursor") ||
    norm.includes("/.claude/") ||
    norm.endsWith("/.claude") ||
    norm.includes("/.github/") ||
    norm.includes("/.runcanon/skills/")
  );
}

function catalogSourcePriority(filePath: string): number {
  const norm = filePath.replace(/\\/g, "/");
  if (isHarnessExportPath(norm)) return 0;
  if (norm.includes("uc-claude-marketplace-security/")) return 3;
  if (norm.includes("uc-claude-marketplace/")) return 2;
  return 1;
}

const TRAJECTORY_EXTENSIONS = new Set([".jsonl"]);
const DOCUMENT_EXTENSIONS = new Set([".md", ".txt"]);

export interface CollectSourcesOptions {
  /** Additional file or directory paths to scan (absolute or relative to project root). */
  sources?: string[];
  /** When true, read JSONL from `.runcanon/trajectories` only (not the whole repo). */
  scanProject?: boolean;
}

export interface CollectSourcesSummary {
  trajectoryFiles: number;
  skillFiles: number;
  documentFiles: number;
  workflowEventCount: number;
  referenceEventCount: number;
  skippedPaths: string[];
  /** Skill catalog dirs auto-included when scanning the project (relative to project root). */
  autoDiscoveredSkillDirs: string[];
}

export interface CollectSourcesResult {
  /** All collected events (workflow + reference). */
  events: TrajectoryEvent[];
  /** Events from agent sessions (tool / prompt sequences) — input to clustering. */
  workflowEvents: TrajectoryEvent[];
  filesRead: string[];
  summary: CollectSourcesSummary;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function walkJsonlFiles(root: string, acc: string[] = []): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(root, entry);
    if (await isDirectory(full)) {
      await walkJsonlFiles(full, acc);
      continue;
    }
    if (extname(entry).toLowerCase() === ".jsonl") {
      acc.push(full);
    }
  }
  return acc;
}

const MAX_SKILL_DISCOVERY_DEPTH = 8;

async function walkSkillFiles(root: string, acc: string[] = []): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(root, entry);
    if (await isDirectory(full)) {
      await walkSkillFiles(full, acc);
      continue;
    }
    if (entry.toLowerCase() === "skill.md") {
      acc.push(full);
    }
  }
  return acc;
}

function isTrajectoriesDir(path: string): boolean {
  const base = basename(path);
  return base === "trajectories" || path.replace(/\\/g, "/").endsWith("/trajectories");
}

function isSkillsDir(path: string): boolean {
  const base = basename(path);
  return base === "skills" || path.replace(/\\/g, "/").includes("/skills/");
}

/** Find `skills/` directories under the project that contain at least one SKILL.md. */
export async function discoverSkillCatalogDirs(
  projectRoot: string,
  maxDepth = MAX_SKILL_DISCOVERY_DEPTH
): Promise<string[]> {
  const root = resolve(projectRoot);
  const found = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      if (!(await isDirectory(full))) continue;

      if (entry === "skills") {
        if (isHarnessExportPath(full)) continue;
        const skillFiles = await walkSkillFiles(full);
        if (skillFiles.length > 0) {
          found.add(full);
        }
        continue;
      }

      if (isHarnessExportPath(full)) continue;

      await walk(full, depth + 1);
    }
  }

  await walk(root, 0);
  return [...found].sort();
}

async function resolveDirectoryFiles(dirPath: string): Promise<{ files: string[]; skipped: boolean }> {
  if (isTrajectoriesDir(dirPath)) {
    return { files: await walkJsonlFiles(dirPath), skipped: false };
  }

  const skillFiles = await walkSkillFiles(dirPath);
  if (skillFiles.length > 0 || isSkillsDir(dirPath)) {
    return { files: skillFiles, skipped: false };
  }

  const jsonlFiles = await walkJsonlFiles(dirPath);
  if (jsonlFiles.length > 0) {
    return { files: jsonlFiles, skipped: false };
  }

  return { files: [], skipped: true };
}

function parseJsonlEvents(content: string, filePath: string): TrajectoryEvent[] {
  const events: TrajectoryEvent[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TrajectoryEvent);
    } catch {
      continue;
    }
  }
  if (events.length === 0 && content.trim()) {
    throw new Error(`No valid trajectory events in ${filePath}`);
  }
  return events;
}

function extractSkillTitle(content: string, filePath: string): string {
  const frontmatterName = content.match(/^---[\s\S]*?\nname:\s*["']?([^"'\n]+)["']?/m)?.[1];
  if (frontmatterName?.trim()) return frontmatterName.trim();
  const h1 = content.match(/^#\s+(.+)$/m)?.[1];
  if (h1?.trim()) return h1.trim();
  return basename(dirnameSkillPath(filePath));
}

function dirnameSkillPath(filePath: string): string {
  return basename(join(filePath, ".."));
}

/** One reference event per existing SKILL.md (for gap analysis, not workflow clustering). */
function skillFileToEvents(content: string, filePath: string, _projectRoot?: string): TrajectoryEvent[] {
  const title = extractSkillTitle(content, filePath);
  const key = canonicalSkillKey(title);
  return [
    {
      id: `${key}-skill-0`,
      sessionId: `skill-${key}`,
      sequence: 0,
      timestamp: new Date().toISOString(),
      actor: "user",
      type: "prompt_invoke",
      intent: `Existing skill: ${title}`,
      action: title,
      metadata: { sourceFile: filePath, sourceKind: "skill", canonicalSkillKey: key, content },
    },
  ];
}

/** One context event per document — not split by heading (that produced spurious proposals). */
function documentToEvents(content: string, filePath: string, projectRoot?: string): TrajectoryEvent[] {
  const label = labelSourcePath(filePath, projectRoot);
  const title =
    content.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    basename(filePath, extname(filePath));
  const baseId = label.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 40);
  return [
    {
      id: `${baseId}-doc-0`,
      sessionId: `doc-${baseId}`,
      sequence: 0,
      timestamp: new Date().toISOString(),
      actor: "user",
      type: "message",
      intent: `Reference: ${title}`,
      action: label,
      metadata: { sourceFile: filePath, sourceKind: "document", content },
    },
  ];
}

async function readSourceFile(
  filePath: string,
  projectRoot?: string
): Promise<{ events: TrajectoryEvent[]; filePath: string; kind: "trajectory" | "skill" | "document" }> {
  const content = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();
  const base = basename(filePath).toLowerCase();

  if (TRAJECTORY_EXTENSIONS.has(ext)) {
    return { events: parseJsonlEvents(content, filePath), filePath, kind: "trajectory" };
  }

  if (base === "skill.md") {
    return { events: skillFileToEvents(content, filePath, projectRoot), filePath, kind: "skill" };
  }

  if (DOCUMENT_EXTENSIONS.has(ext)) {
    return { events: documentToEvents(content, filePath, projectRoot), filePath, kind: "document" };
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}

/** Keep sessions that contain real agent workflow signals (tool/prompt/outcome chains). */
export function filterWorkflowMiningEvents(events: TrajectoryEvent[]): TrajectoryEvent[] {
  const workflowSessions = new Set<string>();
  for (const event of events) {
    if (
      event.type === "tool_call" ||
      event.type === "tool_result" ||
      event.type === "prompt_invoke" ||
      event.type === "prompt_result" ||
      event.type === "outcome"
    ) {
      workflowSessions.add(event.sessionId);
    }
  }

  return events.filter((event) => {
    if (workflowSessions.has(event.sessionId)) return true;
    return event.metadata?.sourceKind === "trajectory";
  });
}

/** Events eligible for clustering (real agent sessions — not catalog imports). */
export function filterClusteringEvents(events: TrajectoryEvent[]): TrajectoryEvent[] {
  return filterWorkflowMiningEvents(events).filter((event) => {
    const kind = event.metadata?.sourceKind;
    if (kind === "skill" || kind === "document") return false;
    return true;
  });
}

/**
 * Collect mining inputs with intentional scoping:
 * - `.runcanon/trajectories` → JSONL agent sessions (primary workflow signal)
 * - `skills/` directories → existing SKILL.md files only (reference)
 * - Explicit files → that file only (.jsonl, SKILL.md, or single doc)
 * - Generic directories of docs are skipped (pass explicit file paths instead)
 */
export async function collectEventsFromSources(
  projectPath: string,
  options: CollectSourcesOptions = {}
): Promise<CollectSourcesResult> {
  const root = resolve(projectPath);
  const paths = new Set<string>();
  const skippedPaths: string[] = [];

  const autoDiscoveredSkillDirs: string[] = [];

  if (options.scanProject !== false) {
    const dataDir = await resolveProjectDataDir(root);
    const trajectoryRoots = new Set<string>();
    trajectoryRoots.add(join(dataDir, "trajectories"));
    for (const dirName of [PROJECT_DATA_DIRNAME, LEGACY_PROJECT_DATA_DIRNAME]) {
      trajectoryRoots.add(join(root, dirName, "trajectories"));
    }
    for (const trajectoryDir of trajectoryRoots) {
      if (await isDirectory(trajectoryDir)) {
        for (const file of await walkJsonlFiles(trajectoryDir)) {
          paths.add(file);
        }
      }
    }

    if ((options.sources ?? []).length === 0) {
      for (const skillDir of await discoverSkillCatalogDirs(root)) {
        autoDiscoveredSkillDirs.push(labelSourcePath(skillDir, root));
        for (const file of await walkSkillFiles(skillDir)) {
          paths.add(file);
        }
      }
    }
  }

  for (const source of options.sources ?? []) {
    const resolved = resolve(root, source);
    if (await isDirectory(resolved)) {
      const { files, skipped } = await resolveDirectoryFiles(resolved);
      if (skipped) {
        skippedPaths.push(source);
        continue;
      }
      for (const file of files) paths.add(file);
    } else {
      paths.add(resolved);
    }
  }

  const events: TrajectoryEvent[] = [];
  const filesRead: string[] = [];
  const summary: CollectSourcesSummary = {
    trajectoryFiles: 0,
    skillFiles: 0,
    documentFiles: 0,
    workflowEventCount: 0,
    referenceEventCount: 0,
    skippedPaths,
    autoDiscoveredSkillDirs,
  };

  for (const filePath of [...paths].sort()) {
    try {
      const result = await readSourceFile(filePath, root);
      events.push(...result.events);
      filesRead.push(result.filePath);
      if (result.kind === "trajectory") summary.trajectoryFiles++;
      else if (result.kind === "skill") summary.skillFiles++;
      else summary.documentFiles++;
    } catch (error) {
      console.warn(`Skipping ${filePath}: ${(error as Error).message}`);
    }
  }

  const dedupedEvents = dedupeSkillCatalogEvents(events);
  if (dedupedEvents.length !== events.length) {
    summary.skillFiles = dedupedEvents.filter((event) => event.metadata?.sourceKind === "skill").length;
  }

  const workflowEvents = filterWorkflowMiningEvents(dedupedEvents);
  summary.workflowEventCount = workflowEvents.length;
  summary.referenceEventCount = dedupedEvents.length - workflowEvents.length;

  return { events: dedupedEvents, workflowEvents, filesRead, summary };
}

/** One catalog event per canonical skill — prefer source marketplace over harness exports. */
function dedupeSkillCatalogEvents(events: TrajectoryEvent[]): TrajectoryEvent[] {
  const passthrough: TrajectoryEvent[] = [];
  const skillByKey = new Map<string, { event: TrajectoryEvent; priority: number }>();

  for (const event of events) {
    if (event.metadata?.sourceKind !== "skill") {
      passthrough.push(event);
      continue;
    }

    const key =
      (typeof event.metadata.canonicalSkillKey === "string" && event.metadata.canonicalSkillKey) ||
      canonicalSkillKey(String(event.action ?? event.intent));
    const sourceFile = typeof event.metadata.sourceFile === "string" ? event.metadata.sourceFile : "";
    const priority = catalogSourcePriority(sourceFile);
    const existing = skillByKey.get(key);
    if (!existing || priority > existing.priority) {
      skillByKey.set(key, { event, priority });
    }
  }

  return [...passthrough, ...[...skillByKey.values()].map(({ event }) => event)];
}
