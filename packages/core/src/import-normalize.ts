import yaml from "js-yaml";

import { isKnownHarness, parseSkill, skillSchema } from "@runcanon/spec";

import { canonicalSkillKey, formatSkillDisplayName } from "./path-labels.js";

import type { Skill, SkillMetrics, SkillTrigger, WorkflowStep } from "@runcanon/spec";

export type ImportedSkillFormat = "runcanon" | "agent-skill" | "markdown-only" | "partial-runcanon";

export interface NormalizedImportResult {
  skill: Skill;
  format: ImportedSkillFormat;
  warnings: string[];
}

const AUXILIARY_MARKDOWN = new Set([
  "readme.md",
  "changelog.md",
  "claude.md",
  "context.md",
  "deepening.md",
  "design-it-twice.md",
  "adr-format.md",
  "context-format.md",
  "html-report.md",
  "logic.md",
  "ui.md",
  "invocation.md",
  "license.md",
  "contributing.md",
  "code_of_conduct.md",
]);

const REQUIRED_RUNCANON_KEYS = ["id", "version", "status", "scope", "harnesses", "tags", "triggers", "metrics"] as const;

/** Whether a repo path looks like a primary skill file (not auxiliary docs). */
export function isPrimarySkillMarkdownPath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (!normalized.endsWith(".md")) return false;
  if (normalized.includes("/docs/")) return false;
  if (normalized.includes("/.changeset/")) return false;
  if (normalized.includes("/.out-of-scope/")) return false;
  if (normalized.includes("/.github/")) return false;

  const base = normalized.split("/").pop() ?? "";
  if (AUXILIARY_MARKDOWN.has(base)) return false;

  if (base === "skill.md") return true;
  if (normalized.includes(".cursor/skills/") || normalized.includes(".claude/skills/")) {
    return base === "skill.md";
  }
  if (normalized.includes("/skills/")) return base === "skill.md";

  return false;
}

function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

function normalizeNewlines(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function splitSkillMarkdown(content: string): { frontmatter: Record<string, unknown>; body: string; hasFrontmatter: boolean } {
  const text = normalizeNewlines(stripBom(content)).trimStart();

  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (match) {
    const frontmatter = safeLoadYaml(match[1]) ?? {};
    return { frontmatter, body: match[2].trim(), hasFrontmatter: true };
  }

  // Tolerate missing closing delimiter (truncated export).
  const openMatch = text.match(/^---\s*\n([\s\S]+)$/);
  if (openMatch && openMatch[1].includes("\n")) {
    const lines = openMatch[1].split("\n");
    const yamlLines: string[] = [];
    let bodyStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        bodyStart = i + 1;
        break;
      }
      yamlLines.push(lines[i]);
    }
    if (bodyStart >= 0) {
      return {
        frontmatter: safeLoadYaml(yamlLines.join("\n")) ?? {},
        body: lines.slice(bodyStart).join("\n").trim(),
        hasFrontmatter: true,
      };
    }
  }

  return { frontmatter: {}, body: text.trim(), hasFrontmatter: false };
}

function safeLoadYaml(raw: string): Record<string, unknown> | null {
  try {
    const loaded = yaml.load(raw.trim());
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      return loaded as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asStringArray(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return value.split(/[,;|\n]/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? [item.trim()] : []))
      .filter(Boolean);
  }
  return [];
}

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function idFromSourcePath(sourcePath?: string): string | undefined {
  if (!sourcePath) return undefined;
  const normalized = sourcePath.replace(/\\/g, "/");
  const skillDir = normalized.match(/\/([^/]+)\/SKILL\.md$/i)?.[1];
  if (skillDir) return canonicalSkillKey(skillDir);
  const file = normalized.match(/\/([^/]+)\.md$/i)?.[1];
  if (file && file.toLowerCase() !== "skill") return canonicalSkillKey(file);
  return undefined;
}

function inferDisplayName(rawName: string, id: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return formatSkillDisplayName(id);
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(trimmed) && !trimmed.includes(" ")) {
    return formatSkillDisplayName(trimmed.replace(/_/g, "-"));
  }
  return formatSkillDisplayName(trimmed);
}

function pickDescription(frontmatter: Record<string, unknown>, body: string): string {
  const fromFm =
    asString(frontmatter.description) ??
    asString(frontmatter.summary) ??
    asString(frontmatter.purpose) ??
    asString(frontmatter.overview);
  if (fromFm) return truncate(fromFm, 500);

  const bodyWithoutTitle = body.replace(/^#\s+[^\n]+\n+/, "").trim();
  const paragraph = bodyWithoutTitle.split(/\n\s*\n/).find((block) => block.trim() && !block.trim().startsWith("#"));
  if (paragraph) {
    const flat = paragraph.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    if (flat) return truncate(flat, 500);
  }

  return "Imported agent skill workflow.";
}

function pickName(frontmatter: Record<string, unknown>, sourcePath?: string): { rawName: string; id: string } {
  const pathId = idFromSourcePath(sourcePath);
  const rawName =
    asString(frontmatter.name) ??
    asString(frontmatter.title) ??
    asString(frontmatter.id) ??
    pathId ??
    "untitled-skill";

  const idCandidate = asString(frontmatter.id) ?? rawName;
  let id = canonicalSkillKey(idCandidate);
  if (id === "untitled-skill" && pathId) id = pathId;
  if (id === "skill") id = pathId ?? "untitled-skill";

  return { rawName, id };
}

function readInvocation(frontmatter: Record<string, unknown>): Skill["invocation"] | undefined {
  const disableModelInvocation =
    frontmatter.disableModelInvocation === true ||
    frontmatter["disable-model-invocation"] === true ||
    frontmatter.disable_model_invocation === true;

  const userInvocableRaw =
    frontmatter.userInvocable ?? frontmatter["user-invocable"] ?? frontmatter.user_invocable;
  const userInvocable = userInvocableRaw === false ? false : userInvocableRaw === true ? true : undefined;

  const allowedTools = asStringArray(
    frontmatter.allowedTools ?? frontmatter["allowed-tools"] ?? frontmatter.allowed_tools
  );
  const disallowedTools = asStringArray(
    frontmatter.disallowedTools ?? frontmatter["disallowed-tools"] ?? frontmatter.disallowed_tools
  );
  const argumentHint = asString(
    frontmatter.argumentHint ?? frontmatter["argument-hint"] ?? frontmatter.argument_hint
  );
  const model = asString(frontmatter.model);
  const effort = asString(frontmatter.effort);

  if (
    !disableModelInvocation &&
    userInvocable === undefined &&
    allowedTools.length === 0 &&
    disallowedTools.length === 0 &&
    !argumentHint &&
    !model &&
    !effort
  ) {
    return undefined;
  }

  return {
    disableModelInvocation: disableModelInvocation || undefined,
    userInvocable,
    allowedTools: allowedTools.length > 0 ? allowedTools : undefined,
    disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
    argumentHint,
    model,
    effort:
      effort === "low" || effort === "medium" || effort === "high" || effort === "max" ? effort : undefined,
  };
}

function readTriggers(frontmatter: Record<string, unknown>, description: string, name: string): SkillTrigger[] {
  const explicit = frontmatter.triggers;
  if (Array.isArray(explicit) && explicit.length > 0) {
    const triggers: SkillTrigger[] = [];
    for (const item of explicit) {
      if (typeof item === "string" && item.trim()) {
        triggers.push({ pattern: item.trim() });
        continue;
      }
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const pattern = asString(record.pattern) ?? asString(record.intent);
        if (pattern) {
          triggers.push({
            pattern,
            globs: asStringArray(record.globs).length > 0 ? asStringArray(record.globs) : undefined,
            alwaysApply: record.alwaysApply === true ? true : undefined,
          });
        }
      }
    }
    if (triggers.length > 0) return triggers;
  }

  const whenToUse = asStringArray(
    frontmatter.when_to_use ?? frontmatter["when-to-use"] ?? frontmatter.whenToUse
  );
  if (whenToUse.length > 0) {
    return whenToUse.map((pattern) => ({ pattern }));
  }

  const globs = asStringArray(frontmatter.paths ?? frontmatter.globs ?? frontmatter.path);
  const pattern = description.length > 20 ? description : `When the user asks to ${name.toLowerCase()}`;
  return [{ pattern: truncate(pattern, 240), globs: globs.length > 0 ? globs : undefined }];
}

function readHarnesses(frontmatter: Record<string, unknown>, sourcePath?: string): Skill["harnesses"] {
  const fromFm = asStringArray(frontmatter.harnesses);
  const normalized = fromFm
    .map((h) => h.toLowerCase().replace(/\s+/g, "-"))
    .filter((h) => isKnownHarness(h));

  if (normalized.length > 0) return normalized as Skill["harnesses"];

  const path = (sourcePath ?? "").toLowerCase();
  if (path.includes(".cursor/skills/")) return ["cursor"];
  if (path.includes(".claude/skills/")) return ["claude"];
  return ["cursor", "claude"];
}

function inferTags(frontmatter: Record<string, unknown>, sourcePath?: string): string[] {
  const fromFm = asStringArray(frontmatter.tags);
  const tags = new Set<string>(fromFm.length > 0 ? fromFm : ["imported"]);

  const path = (sourcePath ?? "").replace(/\\/g, "/").toLowerCase();
  if (path.includes("/deprecated/")) tags.add("deprecated");
  const segments = path.split("/");
  const skillsIdx = segments.indexOf("skills");
  if (skillsIdx >= 0) {
    for (const segment of segments.slice(skillsIdx + 1, -1)) {
      if (segment && segment !== "skill.md" && !segment.includes(".")) {
        tags.add(segment);
      }
    }
  }

  return [...tags].slice(0, 12);
}

function inferScope(frontmatter: Record<string, unknown>): string[] {
  const scope = asStringArray(frontmatter.scope);
  return scope.length > 0 ? scope : ["org-wide"];
}

function inferStatus(frontmatter: Record<string, unknown>, sourcePath?: string): Skill["status"] {
  const raw = asString(frontmatter.status)?.toLowerCase();
  if (
    raw === "active" ||
    raw === "draft" ||
    raw === "proposed" ||
    raw === "retired" ||
    raw === "deprecated"
  ) {
    return raw;
  }
  if ((sourcePath ?? "").toLowerCase().includes("/deprecated/")) return "deprecated";
  return "proposed";
}

function defaultMetrics(): SkillMetrics {
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

function readMetrics(frontmatter: Record<string, unknown>): SkillMetrics {
  const raw = frontmatter.metrics;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const parsed = skillSchema.shape.metrics.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  return defaultMetrics();
}

function extractSection(body: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s*${heading}\\s*$`, "im");
  const startMatch = body.match(pattern);
  if (!startMatch) return null;
  const startIndex = (startMatch.index ?? 0) + startMatch[0].length;
  const remaining = body.slice(startIndex);
  const nextHeading = remaining.match(/^##\s+/m);
  const endIndex = nextHeading?.index ?? remaining.length;
  return remaining.slice(0, endIndex).trim();
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function parseListSteps(section: string): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (numbered) {
      steps.push({ id: numbered[1], instruction: stripMarkdownInline(numbered[2]) });
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      steps.push({ instruction: stripMarkdownInline(bullet[1]) });
      continue;
    }

    const checkbox = line.match(/^\s*-\s*\[[ xX]\]\s+(.+)$/);
    if (checkbox) {
      steps.push({ instruction: stripMarkdownInline(checkbox[1]) });
    }
  }

  return steps.filter((s) => s.instruction.length > 0);
}

function bodyToWorkflow(body: string, frontmatter: Record<string, unknown>, description: string): WorkflowStep[] {
  const fromFm = frontmatter.workflow;
  if (Array.isArray(fromFm) && fromFm.length > 0) {
    const steps: WorkflowStep[] = [];
    for (const item of fromFm) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const instruction = asString(record.instruction);
        if (instruction) {
          steps.push({
            id: asString(record.id),
            instruction,
            action: asString(record.action),
            preconditions: asStringArray(record.preconditions),
            expectedOutcome: asString(record.expectedOutcome ?? record.expected_outcome),
            requiresApproval: record.requiresApproval === true || record.requires_approval === true,
          });
        }
      }
    }
    if (steps.length > 0) return steps;
  }

  for (const heading of ["workflow", "instructions", "steps", "procedure"]) {
    const section = extractSection(body, heading);
    if (section) {
      const steps = parseListSteps(section);
      if (steps.length > 0) return steps;
    }
  }

  const listSteps = parseListSteps(body);
  if (listSteps.length > 0) return listSteps;

  const stripped = body.replace(/^#\s+[^\n]+\n+/, "").trim();
  if (stripped) {
    const paragraphs = stripped.split(/\n\s*\n/).filter((p) => p.trim() && !p.trim().startsWith("#"));
    if (paragraphs.length > 1) {
      return paragraphs.map((p) => ({ instruction: truncate(stripMarkdownInline(p.replace(/\n+/g, " ")), 500) }));
    }
    if (paragraphs.length === 1) {
      return [{ instruction: truncate(stripMarkdownInline(paragraphs[0].replace(/\n+/g, " ")), 500) }];
    }
  }

  return [{ instruction: truncate(description, 500) }];
}

function readPreconditions(frontmatter: Record<string, unknown>, body: string): string[] {
  const fromFm = asStringArray(frontmatter.preconditions);
  if (fromFm.length > 0) return fromFm;

  const section = extractSection(body, "preconditions");
  if (section) {
    const items = parseListSteps(section).map((s) => s.instruction);
    if (items.length > 0) return items;
  }
  return [];
}

function readValidation(frontmatter: Record<string, unknown>, body: string): Skill["validation"] {
  const fromFm = frontmatter.validation;
  if (Array.isArray(fromFm) && fromFm.length > 0) {
    const rules: Skill["validation"] = [];
    for (const item of fromFm) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const description = asString(record.description);
        const severity = asString(record.severity)?.toLowerCase();
        if (description && (severity === "error" || severity === "warning")) {
          rules.push({ description, severity, check: asString(record.check) });
        }
      }
    }
    if (rules.length > 0) return rules;
  }

  const section = extractSection(body, "validation");
  if (!section) return [];

  const rules: Skill["validation"] = [];
  for (const line of section.split("\n")) {
    const match = line.match(/^-\s*\[(ERROR|WARNING)\]\s*(.+)$/i);
    if (match) {
      rules.push({
        severity: match[1].toLowerCase() as "error" | "warning",
        description: match[2].trim(),
      });
    }
  }
  return rules;
}

function readExamples(frontmatter: Record<string, unknown>, body: string, name: string): Skill["examples"] {
  const fromFm = frontmatter.examples;
  if (Array.isArray(fromFm) && fromFm.length > 0) {
    const examples: Skill["examples"] = [];
    for (const item of fromFm) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const prompt = asString(record.prompt);
        const plan = asString(record.plan);
        if (prompt && plan) {
          examples.push({ prompt, plan, output: asString(record.output) });
        }
      }
    }
    if (examples.length > 0) return examples;
  }

  const section = extractSection(body, "examples");
  if (section) {
    const examples: Skill["examples"] = [];
    for (const line of section.split("\n")) {
      const match = line.match(/^-\s*(?:Prompt|User):\s*(.+)$/i);
      if (match) examples.push({ prompt: match[1].trim(), plan: `Follow the ${name} workflow.` });
    }
    if (examples.length > 0) return examples;
  }

  return [{ prompt: `Use ${name}`, plan: `Execute the imported ${name} skill workflow.` }];
}

function missingRunCanonKeys(frontmatter: Record<string, unknown>): string[] {
  return REQUIRED_RUNCANON_KEYS.filter((key) => frontmatter[key] === undefined || frontmatter[key] === null);
}

function detectFormat(hasFrontmatter: boolean, missingKeys: string[]): ImportedSkillFormat {
  if (missingKeys.length === 0 && hasFrontmatter) return "runcanon";
  if (!hasFrontmatter) return "markdown-only";
  if (missingKeys.length > 0 && missingKeys.length < REQUIRED_RUNCANON_KEYS.length) return "partial-runcanon";
  return "agent-skill";
}

function normalizeAgentOrPartialSkill(
  content: string,
  sourcePath: string | undefined,
  format: ImportedSkillFormat,
  warnings: string[]
): Skill {
  const { frontmatter, body, hasFrontmatter } = splitSkillMarkdown(content);
  if (!hasFrontmatter) warnings.push("No YAML frontmatter; inferred fields from path and body.");
  if (hasFrontmatter && !safeLoadYaml(content.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? "")) {
    warnings.push("YAML frontmatter could not be fully parsed; used best-effort field extraction.");
  }

  const { rawName, id } = pickName(frontmatter, sourcePath);
  const name = inferDisplayName(rawName, id);
  const description = pickDescription(frontmatter, body);
  const workflow = bodyToWorkflow(body, frontmatter, description);
  const status = inferStatus(frontmatter, sourcePath);

  const skill: Skill = {
    id,
    name: truncate(name, 120),
    description,
    version: asPositiveInt(frontmatter.version, 1),
    status,
    scope: inferScope(frontmatter),
    harnesses: readHarnesses(frontmatter, sourcePath),
    tags: inferTags(frontmatter, sourcePath),
    triggers: readTriggers(frontmatter, description, name),
    invocation: readInvocation(frontmatter),
    preconditions: readPreconditions(frontmatter, body),
    workflow,
    validation: readValidation(frontmatter, body),
    examples: readExamples(frontmatter, body, name),
    metrics: readMetrics(frontmatter),
    metadata: {
      ...(typeof frontmatter.metadata === "object" && frontmatter.metadata && !Array.isArray(frontmatter.metadata)
        ? (frontmatter.metadata as Record<string, unknown>)
        : {}),
      importedFrom: sourcePath,
      generatedBy: "import-normalize",
      importFormat: format,
      importWarnings: warnings.length > 0 ? warnings : undefined,
    },
  };

  const validated = skillSchema.safeParse(skill);
  if (!validated.success) {
    const issues = validated.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Could not normalize imported skill:\n${issues}`);
  }

  return validated.data;
}

/**
 * Normalize markdown from external agent skill repos into a canonical RunCanon Skill.
 * Accepts RunCanon, Cursor/Claude agent SKILL.md, partial frontmatter, and body-only markdown.
 */
export function normalizeImportedSkillMarkdown(content: string, sourcePath?: string): NormalizedImportResult {
  const warnings: string[] = [];

  if (!content.trim()) {
    throw new Error("Skill file is empty");
  }

  if (sourcePath && !isPrimarySkillMarkdownPath(sourcePath)) {
    warnings.push("File path is not a standard SKILL.md location; import may be unintended.");
  }

  try {
    const { skill } = parseSkill(content);
    return {
      skill: {
        ...skill,
        id: skill.id || idFromSourcePath(sourcePath) || canonicalSkillKey(skill.name),
        name: formatSkillDisplayName(skill.name),
        status: skill.status === "active" ? "proposed" : skill.status,
        metadata: {
          ...skill.metadata,
          importedFrom: sourcePath,
          generatedBy: skill.metadata?.generatedBy ?? "import",
          importFormat: "runcanon",
        },
      },
      format: "runcanon",
      warnings,
    };
  } catch (canonicalErr) {
    const message = canonicalErr instanceof Error ? canonicalErr.message : String(canonicalErr);
    if (!message.includes("Invalid skill frontmatter") && !message.includes("YAML frontmatter")) {
      throw canonicalErr instanceof Error ? canonicalErr : new Error(message);
    }
  }

  const { frontmatter, hasFrontmatter } = splitSkillMarkdown(content);
  const missingKeys = missingRunCanonKeys(frontmatter);
  const format = detectFormat(hasFrontmatter, missingKeys);

  if (format === "partial-runcanon") {
    warnings.push(`Partial RunCanon frontmatter; filled defaults for: ${missingKeys.join(", ")}`);
  }

  const skill = normalizeAgentOrPartialSkill(content, sourcePath, format, warnings);
  return { skill, format, warnings };
}
