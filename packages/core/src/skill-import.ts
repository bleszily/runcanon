import type { Skill } from "@runcanon/spec";

import { normalizeImportedSkillMarkdown } from "./import-normalize.js";
import { formatSkillDisplayName, canonicalSkillKey } from "./path-labels.js";
import type { LlmProvider } from "./llm/provider.js";
import { extractJson } from "./llm/provider.js";
import { computeGoalAlignmentEnhanced } from "./scoring.js";

export interface ImportAssessment {
  score: number;
  rationale: string;
  goalAlignment: number;
  usedLlm: boolean;
  issues: string[];
}

export interface EnrichImportedSkillOptions {
  llm?: LlmProvider;
  goals?: string[];
  existingSkillIds?: string[];
  sourcePath?: string;
  /** Per-skill LLM call timeout (default 45s). */
  timeoutMs?: number;
}

export interface EnrichImportedSkillResult {
  skill: Skill;
  assessment: ImportAssessment;
}

/** Above this count, bulk git import uses heuristics instead of per-skill LLM. */
export const IMPORT_BULK_LLM_THRESHOLD = 5;

/** Default timeout for a single import enrichment LLM call. */
export const IMPORT_LLM_TIMEOUT_MS = 45_000;

export function shouldUseLlmForImport(
  fileCount: number,
  enrichRequested: boolean
): { useLlm: boolean; skippedReason?: string } {
  if (!enrichRequested) {
    return { useLlm: false };
  }
  if (fileCount > IMPORT_BULK_LLM_THRESHOLD) {
    return {
      useLlm: false,
      skippedReason: `LLM enrichment skipped for bulk import (${fileCount} skills; max ${IMPORT_BULK_LLM_THRESHOLD} for per-skill LLM). Used heuristics instead.`,
    };
  }
  return { useLlm: true };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function heuristicAssessment(skill: Skill, goals: string[]): ImportAssessment {
  const issues: string[] = [];
  if (!skill.description?.trim()) issues.push("Missing description");
  if (skill.workflow.length === 0) issues.push("Empty workflow");
  if (skill.triggers.length === 0) issues.push("No triggers defined");

  let score = 0.5;
  if (skill.workflow.length >= 3) score += 0.15;
  if (skill.validation.length > 0) score += 0.1;
  if (skill.triggers.length > 0) score += 0.1;
  if (skill.description.length > 40) score += 0.1;
  score = Math.min(1, score);

  const goalAlignment =
    goals.length > 0
      ? computeGoalAlignmentEnhanced(
          skill.triggers.map((t, i) => ({
            id: `import-${i}`,
            sessionId: "import",
            intent: t.pattern,
            signature: [],
            events: [],
            outcome: "success" as const,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            segmentationConfidence: 1,
          })),
          goals
        )
      : 0.5;

  return {
    score,
    rationale: issues.length > 0 ? `Heuristic review flagged: ${issues.join(", ")}` : "Skill structure looks usable.",
    goalAlignment,
    usedLlm: false,
    issues,
  };
}

/** Parse raw markdown into a skill, tolerating RunCanon, Cursor/Claude, and partial formats. */
export function parseImportedSkillMarkdown(content: string, sourcePath?: string): Skill {
  const { skill, warnings } = normalizeImportedSkillMarkdown(content, sourcePath);
  const idFromPath =
    sourcePath?.match(/\/([^/]+)\/SKILL\.md$/i)?.[1] ??
    sourcePath?.match(/\/([^/]+)\.md$/i)?.[1];
  const id = skill.id || (idFromPath ? canonicalSkillKey(idFromPath) : canonicalSkillKey(skill.name));

  return {
    ...skill,
    id,
    name: formatSkillDisplayName(skill.name),
    status: skill.status === "active" ? "proposed" : skill.status,
    metadata: {
      ...skill.metadata,
      importedFrom: sourcePath ?? skill.metadata?.importedFrom,
      generatedBy: skill.metadata?.generatedBy ?? "import",
      importWarnings:
        warnings.length > 0
          ? [...warnings, ...asStringArray(skill.metadata?.importWarnings)]
          : asStringArray(skill.metadata?.importWarnings),
    },
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Assess and enrich an imported skill using the same LLM pipeline as mining.
 * Falls back to heuristics when no provider is configured.
 */
export async function assessAndEnrichImportedSkill(
  raw: Skill,
  options: EnrichImportedSkillOptions = {}
): Promise<EnrichImportedSkillResult> {
  const goals = options.goals ?? [];
  const baseline = heuristicAssessment(raw, goals);

  if (!options.llm) {
    return { skill: raw, assessment: baseline };
  }

  try {
    const prompt = `You are RunCanon. Assess and enrich an imported agent skill for an organization library.

Project goals:
${goals.length > 0 ? goals.map((g) => `- ${g}`).join("\n") : "- Secure, reusable agent workflows"}

Existing skill ids (avoid duplicates): ${(options.existingSkillIds ?? []).slice(0, 20).join(", ") || "none"}

Imported skill (JSON):
${JSON.stringify(
  {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    tags: raw.tags,
    triggers: raw.triggers,
    workflow: raw.workflow,
    validation: raw.validation,
    examples: raw.examples,
  },
  null,
  2
)}

Respond with ONLY JSON:
{
  "assessmentScore": number,
  "goalAlignment": number,
  "rationale": string,
  "issues": string[],
  "skill": {
    "id": string,
    "name": string,
    "description": string,
    "tags": string[],
    "triggers": [{"pattern": string}],
    "workflow": [{"instruction": string, "harness": string|null}],
    "validation": [{"description": string, "severity": "error"|"warning", "check": string|null}],
    "examples": [{"prompt": string, "plan": string}]
  }
}

assessmentScore and goalAlignment must be 0-1. Preserve skill intent; improve clarity, triggers, workflow ordering, and validation. Use kebab-case id.`;

    const timeoutMs = options.timeoutMs ?? IMPORT_LLM_TIMEOUT_MS;
    const result = await withTimeout(
      options.llm.complete({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        maxTokens: 4096,
      }),
      timeoutMs,
      "Import LLM enrichment"
    );

    const parsed = extractJson<{
      assessmentScore: number;
      goalAlignment: number;
      rationale: string;
      issues?: string[];
      skill: Partial<Skill>;
    }>(result.content);

    const enriched: Skill = {
      ...raw,
      ...parsed.skill,
      id: canonicalSkillKey(parsed.skill.id ?? raw.id),
      name: formatSkillDisplayName(parsed.skill.name ?? raw.name),
      status: "proposed",
      version: raw.version ?? 1,
      metadata: {
        ...raw.metadata,
        importedFrom: options.sourcePath ?? raw.metadata?.importedFrom,
        generatedBy: "llm-import",
        enrichmentRationale: parsed.rationale,
      },
    };

    return {
      skill: enriched,
      assessment: {
        score: Math.max(0, Math.min(1, parsed.assessmentScore)),
        goalAlignment: Math.max(0, Math.min(1, parsed.goalAlignment)),
        rationale: parsed.rationale,
        usedLlm: true,
        issues: parsed.issues ?? [],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "LLM enrichment failed";
    return {
      skill: raw,
      assessment: {
        ...baseline,
        rationale: baseline.rationale.includes("Heuristic")
          ? `${baseline.rationale} (${message})`
          : message,
      },
    };
  }
}
