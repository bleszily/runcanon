import { randomUUID } from "node:crypto";

import {
  assessAndEnrichImportedSkill,
  configToLlmProviderConfig,
  createLlmProvider,
  fetchSkillsFromGitRepo,
  gitImportRequestSchema,
  parseGitRepoUrl,
  parseImportedSkillMarkdown,
  shouldUseLlmForImport,
  type GitImportRequest,
} from "@runcanon/core";
import { loadConfig } from "@runcanon/core";
import { parseSkill, serializeSkill, type Skill, type SkillProposal } from "@runcanon/spec";
import { publishOrgSkill, submitOrgPromotion } from "@runcanon/platform";

import type { AuthContext } from "./auth.js";
import { isOrgAdmin } from "./auth.js";
import { appendAudit } from "./audit.js";
import { resolveActiveLlmConfig } from "./platform.js";
import {
  listSkills,
  resolveSkillPaths,
  saveSkillFromMarkdown,
  upsertActiveSkill,
  type SkillPaths,
} from "./registry.js";

export interface GitImportOptions {
  auth: AuthContext;
  repoUrl?: string;
  provider?: "github" | "bitbucket";
  owner?: string;
  repo?: string;
  branch?: string;
  pathPrefix?: string;
  token?: string;
  destination?: "workspace" | "org" | "proposal";
  enrich?: boolean;
  autoPublishOrg?: boolean;
}

export interface ImportedSkillResult {
  path: string;
  skillId: string;
  name: string;
  assessment: {
    score: number;
    rationale: string;
    goalAlignment: number;
    usedLlm: boolean;
  };
  destination: string;
}

async function publishOrQueueOrgSkill(
  auth: AuthContext,
  skill: Skill,
  assessmentScore?: number
): Promise<"published" | "queued"> {
  const markdown = serializeSkill({ ...skill, status: "active" });
  const harnesses = skill.harnesses.map((h) => (typeof h === "string" ? h : String(h)));

  if (isOrgAdmin(auth)) {
    await publishOrgSkill({
      skillId: skill.id,
      name: skill.name,
      markdown,
      publishedBy: auth.actor,
      tags: skill.tags,
      harnesses,
    });
    return "published";
  }

  await submitOrgPromotion({
    skillId: skill.id,
    name: skill.name,
    markdown,
    source: "import",
    submittedBy: auth.actor,
    assessmentScore,
    harnesses,
    tags: skill.tags,
  });
  return "queued";
}

export async function importSkillsFromGit(options: GitImportOptions): Promise<{
  imported: ImportedSkillResult[];
  skipped: Array<{ path: string; reason: string }>;
  llmUsed: boolean;
  enrichSkippedReason?: string;
}> {
  let request: GitImportRequest;
  if (options.repoUrl) {
    request = parseGitRepoUrl(options.repoUrl, options.provider);
    if (options.branch) request.branch = options.branch;
    if (options.pathPrefix) request.pathPrefix = options.pathPrefix;
    if (options.token) request.token = options.token;
  } else {
    request = gitImportRequestSchema.parse({
      provider: options.provider,
      owner: options.owner,
      repo: options.repo,
      branch: options.branch ?? "main",
      pathPrefix: options.pathPrefix,
      token: options.token,
    });
  }

  const gitResult = await fetchSkillsFromGitRepo(request);
  console.log(
    `[runcanon:import] fetched ${gitResult.files.length} skill file(s) from ${gitResult.owner}/${gitResult.repo}@${gitResult.branch} via ${gitResult.source}`
  );

  const paths = await resolveSkillPaths();
  const config = await loadConfig(paths.projectPath);
  const llmConfig = (await resolveActiveLlmConfig()) ?? configToLlmProviderConfig(config);
  const enrichPlan = shouldUseLlmForImport(gitResult.files.length, options.enrich !== false);
  if (enrichPlan.skippedReason) {
    console.log(`[runcanon:import] ${enrichPlan.skippedReason}`);
  }
  const llm = enrichPlan.useLlm && llmConfig ? createLlmProvider(llmConfig) : undefined;
  console.log(
    `[runcanon:import] processing ${gitResult.files.length} file(s), llm=${Boolean(llm)}, destination=${options.destination ?? "workspace"}`
  );

  const { active } = await listSkills(paths);
  const existingIds = active.map((s) => s.id);

  const imported: ImportedSkillResult[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const destination = options.destination ?? "workspace";
  const total = gitResult.files.length;

  for (let index = 0; index < gitResult.files.length; index++) {
    const file = gitResult.files[index]!;
    try {
      let skill = parseImportedSkillMarkdown(file.content, file.path);
      const enriched = await assessAndEnrichImportedSkill(skill, {
        llm,
        goals: config.goals,
        existingSkillIds: existingIds,
        sourcePath: `${gitResult.provider}:${gitResult.owner}/${gitResult.repo}@${gitResult.branch}:${file.path}`,
      });
      skill = enriched.skill;

      if (destination === "org") {
        const outcome = await publishOrQueueOrgSkill(options.auth, skill, enriched.assessment.score);
        imported.push({
          path: file.path,
          skillId: skill.id,
          name: skill.name,
          assessment: {
            score: enriched.assessment.score,
            rationale: enriched.assessment.rationale,
            goalAlignment: enriched.assessment.goalAlignment,
            usedLlm: enriched.assessment.usedLlm,
          },
          destination: outcome === "queued" ? "org-queue" : "org",
        });
      } else if (destination === "proposal") {
        await saveImportedProposal(paths, skill, enriched.assessment, options.auth.actor);
        imported.push({
          path: file.path,
          skillId: skill.id,
          name: skill.name,
          assessment: {
            score: enriched.assessment.score,
            rationale: enriched.assessment.rationale,
            goalAlignment: enriched.assessment.goalAlignment,
            usedLlm: enriched.assessment.usedLlm,
          },
          destination,
        });
      } else {
        await upsertActiveSkill(paths, { ...skill, status: "active" });
        let dest = destination;
        if (options.autoPublishOrg) {
          const outcome = await publishOrQueueOrgSkill(options.auth, skill, enriched.assessment.score);
          dest = outcome === "queued" ? "workspace+org-queue" : "workspace+org";
        }
        imported.push({
          path: file.path,
          skillId: skill.id,
          name: skill.name,
          assessment: {
            score: enriched.assessment.score,
            rationale: enriched.assessment.rationale,
            goalAlignment: enriched.assessment.goalAlignment,
            usedLlm: enriched.assessment.usedLlm,
          },
          destination: dest,
        });
      }

      existingIds.push(skill.id);
      console.log(`[runcanon:import] ${index + 1}/${total} ${skill.id} (${skill.name})`);
    } catch (err) {
      skipped.push({ path: file.path, reason: err instanceof Error ? err.message : "Parse failed" });
      console.log(`[runcanon:import] ${index + 1}/${total} skipped ${file.path}`);
    }
  }

  await appendAudit(paths, {
    action: "org.import",
    actor: options.auth.actor,
    resourceType: "skill",
    note: `Imported ${imported.length} skills from ${gitResult.owner}/${gitResult.repo}`,
  });

  console.log(`[runcanon:import] done imported=${imported.length} skipped=${skipped.length}`);

  return {
    imported,
    skipped,
    llmUsed: Boolean(llm),
    enrichSkippedReason: enrichPlan.skippedReason,
  };
}

async function saveImportedProposal(
  paths: SkillPaths,
  skill: Skill,
  assessment: { score: number; rationale: string },
  actor: string
): Promise<void> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await mkdir(paths.proposedDir, { recursive: true });
  await mkdir(paths.registryProposedDir, { recursive: true });

  const proposal: SkillProposal = {
    id: `p-${randomUUID().slice(0, 8)}`,
    skillId: skill.id,
    action: "create",
    confidence: assessment.score,
    reason: assessment.rationale,
    payload: { ...skill, status: "proposed" },
    metadata: {
      createdAt: new Date().toISOString(),
      importedBy: actor,
    },
  };

  await writeFile(join(paths.proposedDir, `${skill.id}.md`), serializeSkill(proposal.payload), "utf-8");
  await writeFile(join(paths.registryProposedDir, `${skill.id}.json`), JSON.stringify(proposal, null, 2), "utf-8");
}

export async function createOrgSkillFromMarkdown(input: {
  auth: AuthContext;
  markdown: string;
  publishToOrg?: boolean;
}): Promise<{ skill: Skill; orgPublished: boolean; queued?: boolean }> {
  const paths = await resolveSkillPaths();
  const { skill } = parseSkill(input.markdown);
  const active = await upsertActiveSkill(paths, { ...skill, status: "active" });

  let orgPublished = false;
  let queued = false;
  if (input.publishToOrg !== false) {
    const outcome = await publishOrQueueOrgSkill(input.auth, active);
    orgPublished = outcome === "published";
    queued = outcome === "queued";
  }

  await appendAudit(paths, {
    action: "skill.create",
    actor: input.auth.actor,
    resourceType: "skill",
    resourceId: active.id,
  });

  return { skill: active, orgPublished, queued };
}

export async function updateWorkspaceSkillMarkdown(input: {
  auth: AuthContext;
  skillId: string;
  markdown: string;
  syncOrg?: boolean;
}): Promise<Skill> {
  const paths = await resolveSkillPaths();
  const skill = await saveSkillFromMarkdown(paths, input.markdown, { forceStatus: "active" });

  if (input.syncOrg) {
    await publishOrQueueOrgSkill(input.auth, skill);
  }

  await appendAudit(paths, {
    action: "skill.update",
    actor: input.auth.actor,
    resourceType: "skill",
    resourceId: skill.id,
  });

  return skill;
}

export async function updateOrgSkillMarkdown(input: {
  auth: AuthContext;
  skillId: string;
  markdown: string;
}): Promise<void> {
  const { updateOrgSkillContent } = await import("@runcanon/platform");
  const { skill } = parseSkill(input.markdown);
  await updateOrgSkillContent({
    skillId: input.skillId,
    markdown: input.markdown,
    name: skill.name,
    updatedBy: input.auth.actor,
  });
}

export function newSkillTemplate(name: string, id?: string): string {
  const slug =
    id ??
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const now = new Date().toISOString();
  return serializeSkill({
    id: slug || "new-skill",
    name,
    description: "Describe what this skill helps agents accomplish.",
    version: 1,
    status: "active",
    scope: ["org-wide"],
    harnesses: ["cursor"],
    tags: ["imported"],
    triggers: [{ pattern: `When the user asks to ${name.toLowerCase()}` }],
    preconditions: [],
    workflow: [{ instruction: "First step of the workflow." }],
    validation: [{ description: "Workflow completed without errors.", severity: "error" }],
    examples: [{ prompt: "Example user request", plan: "High-level plan the agent should follow." }],
    metrics: {
      frequency: 0,
      successRate: 0,
      failureRate: 0,
      weaknessScore: 0,
      stalenessScore: 0,
      importanceScore: 0.5,
      generatedAt: now,
      sampleSize: 0,
    },
  });
}
