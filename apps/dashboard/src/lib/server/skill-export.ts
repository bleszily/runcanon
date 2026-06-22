import { loadConfig, writeSkillsToProject, DEFAULT_SYNC_HARNESSES } from "@runcanon/core";
import {
  getActiveWorkspaceForUser,
  listUserAssignments,
  readOrgSkillMarkdown,
  recordOrgExport,
  resolveAllOrgSkillIds,
  resolveUserOrgSkillIds,
  type EntitlementContext,
} from "@runcanon/platform";
import { isKnownHarness, type Harness, type Skill } from "@runcanon/spec";

import type { AuthContext } from "./auth.js";
import { isOrgAdmin } from "./auth.js";
import { loadOrgSkillParsed } from "./org-skills.js";
import { listSkills, readSkillDirectory, resolveSkillPaths, type SkillPaths } from "./registry.js";

export interface EntitledSkillsPayload {
  skills: Skill[];
  workspaceSkills: Skill[];
  orgSkills: Skill[];
  mandatoryOrgSkillIds: string[];
  missingMandatory: string[];
}

function parseHarnessInput(harnessInput: string, configHarnesses: Harness[]): Harness[] {
  if (harnessInput === "all" || harnessInput === "sync") {
    return harnessInput === "sync" ? DEFAULT_SYNC_HARNESSES : configHarnesses;
  }
  const target = harnessInput.split(",").map((h) => h.trim() as Harness);
  const invalid = target.filter((h) => !isKnownHarness(h));
  if (invalid.length > 0) {
    throw new Error(`Unsupported harness(es): ${invalid.join(", ")}`);
  }
  return target;
}

async function loadOrgSkillsByIds(ids: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];
  for (const id of ids) {
    const skill = await loadOrgSkillParsed(id);
    if (skill) skills.push(skill);
  }
  return skills;
}

/** Collect workspace + entitled org skills for export/sync (org overrides workspace on id collision). */
export async function collectEntitledSkills(
  auth: AuthContext,
  context?: EntitlementContext
): Promise<EntitledSkillsPayload> {
  // Workspace skills live in the signed-in user's server workspace — never on the client's machine path.
  const workspacePaths = await resolveSkillPaths();
  const workspaceSkills = await readSkillDirectory(workspacePaths.activeDir);

  let orgSkillIds: string[] = [];
  if (auth.user) {
    orgSkillIds = isOrgAdmin(auth)
      ? await resolveAllOrgSkillIds()
      : await resolveUserOrgSkillIds(auth.user.id, context);
  }

  const orgSkills = await loadOrgSkillsByIds(orgSkillIds);

  const mandatoryOrgSkillIds =
    auth.user != null
      ? (await listUserAssignments(auth.user.id, context))
          .filter((a) => a.mandatory)
          .map((a) => a.skillId)
      : [];

  const merged = new Map<string, Skill>();
  for (const skill of workspaceSkills) merged.set(skill.id, skill);
  for (const skill of orgSkills) merged.set(skill.id, skill);

  const missingMandatory = mandatoryOrgSkillIds.filter((id) => !merged.has(id));
  for (const id of missingMandatory) {
    const skill = await loadOrgSkillParsed(id);
    if (skill) merged.set(id, skill);
  }

  return {
    skills: [...merged.values()],
    workspaceSkills,
    orgSkills,
    mandatoryOrgSkillIds,
    missingMandatory: missingMandatory.filter((id) => !merged.has(id)),
  };
}

/** Workspace skills plus entitled org library skills (for Skills page and API). */
export async function listEntitledSkillsForDashboard(auth: AuthContext): Promise<Skill[]> {
  const paths = await resolveSkillPaths();
  const { proposed, retired } = await listSkills(paths);
  const { skills: entitledActive } = await collectEntitledSkills(auth);
  const entitledIds = new Set(entitledActive.map((skill) => skill.id));
  const workspaceOnlyLifecycle = [...proposed, ...retired].filter((skill) => !entitledIds.has(skill.id));
  return [...entitledActive, ...workspaceOnlyLifecycle];
}

export interface ExportSkillsOptions {
  auth: AuthContext;
  harnessInput: string;
  projectPath?: string;
  prune?: boolean;
  recordMetrics?: boolean;
}

export interface ExportSkillsResult {
  harnesses: string[];
  skillCount: number;
  filesWritten: number;
  paths: string[];
  skipped: string[];
  pruned: string[];
  mandatoryOrgSkillIds: string[];
  missingMandatory: string[];
}

/** Export entitled workspace + org skills to all target harness paths. */
export async function exportEntitledSkills(options: ExportSkillsOptions): Promise<ExportSkillsResult> {
  const paths = await resolveSkillPaths();

  let harnesses: Harness[];
  if (options.harnessInput !== "all" && options.harnessInput !== "sync") {
    harnesses = parseHarnessInput(options.harnessInput, DEFAULT_SYNC_HARNESSES);
  } else {
    const config = await loadConfig(paths.projectPath);
    harnesses = parseHarnessInput(options.harnessInput, config.harnesses);
  }

  const workspace =
    options.auth.user?.id != null
      ? await getActiveWorkspaceForUser(options.auth.user.id, isOrgAdmin(options.auth))
      : undefined;

  const entitled = await collectEntitledSkills(options.auth, {
    workspaceId: workspace?.id,
    projectPath: paths.projectPath,
  });

  if (entitled.skills.length === 0) {
    return {
      harnesses,
      skillCount: 0,
      filesWritten: 0,
      paths: [],
      skipped: [],
      pruned: [],
      mandatoryOrgSkillIds: entitled.mandatoryOrgSkillIds,
      missingMandatory: entitled.missingMandatory,
    };
  }

  const prepared = entitled.skills.map((skill) => ({
    ...skill,
    harnesses: skill.harnesses?.length ? skill.harnesses : harnesses,
  }));

  const result = await writeSkillsToProject({
    projectRoot: paths.projectPath,
    skills: prepared,
    harnesses,
    overwrite: true,
    prune: options.prune ?? true,
    includeProjectInstructions: true,
  });

  if (options.recordMetrics !== false && options.auth.user) {
    await recordOrgExport(options.auth.actor, result.skillCount);
  }

  return {
    harnesses: result.harnesses,
    skillCount: result.skillCount,
    filesWritten: result.filesWritten,
    paths: result.paths,
    skipped: result.skipped,
    pruned: result.pruned,
    mandatoryOrgSkillIds: entitled.mandatoryOrgSkillIds,
    missingMandatory: entitled.missingMandatory,
  };
}

/** Load org skill markdown map for signed bundle export. */
export async function loadOrgMarkdownMap(skillIds: string[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const id of skillIds) {
    const markdown = await readOrgSkillMarkdown(id);
    if (markdown) files[id] = markdown;
  }
  return files;
}

/** Serialize workspace skills to markdown for bundles. */
export async function loadWorkspaceMarkdownMap(paths: SkillPaths, skills: Skill[]): Promise<Record<string, string>> {
  const { serializeSkill } = await import("@runcanon/spec");
  const files: Record<string, string> = {};
  for (const skill of skills) {
    files[skill.id] = serializeSkill(skill);
  }
  return files;
}
