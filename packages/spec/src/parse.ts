import yaml from "js-yaml";

import { skillSchema } from "./schema.js";

import type { Skill } from "./types.js";

export interface ParsedSkill {
  skill: Skill;
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * Parse a canonical RunCanon markdown skill file.
 *
 * Expected format:
 *   ---
 *   YAML frontmatter
 *   ---
 *   markdown body with ## preconditions, ## workflow, ## validation, ## examples
 */
export function parseSkill(content: string): ParsedSkill {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error("Skill file must begin with YAML frontmatter delimited by ---");
  }

  const frontmatterRaw = frontmatterMatch[1];
  const body = frontmatterMatch[2].trim();
  const frontmatter = yaml.load(frontmatterRaw) as Record<string, unknown>;

  // The canonical serializer stores workflow, preconditions, validation, and
  // examples in markdown body sections. Provide empty defaults here so schema
  // validation passes and the body parsers below can override them.
  const forValidation = {
    preconditions: [],
    workflow: [{ instruction: "Placeholder workflow step" }],
    validation: [],
    examples: [],
    ...frontmatter,
  };

  const parsed = skillSchema.safeParse(forValidation);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid skill frontmatter:\n${issues}`);
  }

  const workflow = parseWorkflow(body);
  const validation = parseValidation(body);
  const examples = parseExamples(body);

  // Override empty arrays parsed from body if frontmatter explicitly provided them.
  const skill: Skill = {
    ...parsed.data,
    workflow: workflow.length > 0 ? workflow : parsed.data.workflow,
    validation: validation.length > 0 ? validation : parsed.data.validation,
    examples: examples.length > 0 ? examples : parsed.data.examples,
  };

  return { skill, frontmatter, body };
}

function parseWorkflow(body: string): Skill["workflow"] {
  const section = extractSection(body, "workflow");
  if (!section) return [];

  const steps: Skill["workflow"] = [];
  const lines = section.split("\n");
  let current: Partial<Skill["workflow"][number]> | null = null;

  for (const line of lines) {
    const topLevel = line.match(/^(\d+)\.\s*\*\*(.+?)\*\*$/);
    if (topLevel) {
      if (current) steps.push(current as Skill["workflow"][number]);
      current = { id: topLevel[1], instruction: topLevel[2].trim() };
      continue;
    }

    if (!current) continue;

    const action = line.match(/^\s*-\s*Action:\s*`?(.+?)`?\s*$/);
    if (action) {
      current.action = action[1].trim();
      continue;
    }

    const preconditions = line.match(/^\s*-\s*Preconditions:\s*(.+)$/);
    if (preconditions) {
      current.preconditions = preconditions[1].split(";").map((s) => s.trim());
      continue;
    }

    const expected = line.match(/^\s*-\s*Expected outcome:\s*(.+)$/);
    if (expected) {
      current.expectedOutcome = expected[1].trim();
      continue;
    }

    if (/^\s*-\s*⚠️\s*Requires explicit user approval\.?\s*$/.test(line)) {
      current.requiresApproval = true;
    }
  }

  if (current) steps.push(current as Skill["workflow"][number]);
  return steps;
}

function parseValidation(body: string): Skill["validation"] {
  const section = extractSection(body, "validation");
  if (!section) return [];

  const rules: Skill["validation"] = [];
  const lines = section.split("\n");

  for (const line of lines) {
    const match = line.match(/^-\s*\[(ERROR|WARNING)\]\s*(.+)$/);
    if (match) {
      rules.push({ severity: match[1].toLowerCase() as "error" | "warning", description: match[2].trim() });
    }
  }

  return rules;
}

function parseExamples(body: string): Skill["examples"] {
  const section = extractSection(body, "examples");
  if (!section) return [];

  const examples: Skill["examples"] = [];
  const lines = section.split("\n");
  let current: Partial<Skill["examples"][number]> | null = null;
  let collectingOutput = false;
  let outputLines: string[] = [];

  for (const line of lines) {
    const promptMatch = line.match(/^###\s*User:\s*(.+)$/);
    if (promptMatch) {
      if (current) {
        if (collectingOutput) {
          current.output = outputLines.join("\n").trim();
        }
        examples.push(current as Skill["examples"][number]);
      }
      current = { prompt: promptMatch[1].trim() };
      collectingOutput = false;
      outputLines = [];
      continue;
    }

    if (!current) continue;

    const planMatch = line.match(/^\*\*Plan:\*\*\s*(.+)$/);
    if (planMatch) {
      current.plan = planMatch[1].trim();
      continue;
    }

    if (/^\*\*Output:\*\*$/.test(line)) {
      collectingOutput = true;
      continue;
    }

    if (collectingOutput) {
      if (line.trim() === "```") continue;
      outputLines.push(line);
    }
  }

  if (current) {
    if (collectingOutput) {
      current.output = outputLines.join("\n").trim();
    }
    examples.push(current as Skill["examples"][number]);
  }

  return examples;
}

function extractSection(body: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s*${heading}\\s*$`, "im");
  const startMatch = body.match(pattern);
  if (!startMatch) return null;

  const startIndex = (startMatch.index ?? 0) + startMatch[0].length;
  const remaining = body.slice(startIndex);
  const nextHeading = remaining.match(/^##\s+/m);
  const endIndex = nextHeading ? nextHeading.index : remaining.length;
  return remaining.slice(0, endIndex).trim();
}
