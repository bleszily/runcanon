import yaml from "js-yaml";

import { renderExamplesMarkdown, renderPreconditionsMarkdown, renderValidationMarkdown, renderWorkflowMarkdown, result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/**
 * Render a RunCanon skill for GitHub Copilot.
 *
 * Output:
 * - .github/instructions/{skillId}.instructions.md for path-specific instructions
 * - .github/copilot-instructions.md for the project-wide aggregate
 */
export function renderCopilotSkill(skill: Skill): HarnessRenderResult[] {
  const results: HarnessRenderResult[] = [];
  const globs = skill.triggers.flatMap((t) => t.globs ?? []);

  const frontmatter: Record<string, unknown> = {};
  if (globs.length > 0) {
    frontmatter.applyTo = globs.join(",");
  }
  frontmatter.name = skill.name;
  frontmatter.description = skill.description;

  const bodyLines: string[] = [];
  bodyLines.push(`# ${skill.name}`);
  bodyLines.push("");
  bodyLines.push(skill.description);
  bodyLines.push("");

  if (skill.preconditions.length > 0) {
    bodyLines.push("## Preconditions");
    bodyLines.push(renderPreconditionsMarkdown(skill));
    bodyLines.push("");
  }

  bodyLines.push("## Workflow");
  bodyLines.push(renderWorkflowMarkdown(skill));
  bodyLines.push("");

  if (skill.validation.length > 0) {
    bodyLines.push("## Validation");
    bodyLines.push(renderValidationMarkdown(skill));
    bodyLines.push("");
  }

  if (skill.examples.length > 0) {
    bodyLines.push("## Examples");
    bodyLines.push(renderExamplesMarkdown(skill));
    bodyLines.push("");
  }

  const content = ["---", yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", bodyLines.join("\n")].join("\n");

  results.push(result(`.github/instructions/${skill.id}.instructions.md`, content));

  return results;
}

/**
 * Render the project-wide GitHub Copilot instructions file.
 */
export function renderCopilotProjectInstructions(skills: Skill[]): HarnessRenderResult {
  const lines: string[] = [];
  lines.push("# Project Skills");
  lines.push("");
  lines.push("This project uses RunCanon-generated skills. When a user request matches one of the workflows below, follow the corresponding instructions.");
  lines.push("");
  lines.push("| Skill | When to use |");
  lines.push("|-------|-------------|");

  for (const skill of skills.filter((s) => s.status === "active")) {
    const when = skill.triggers.map((t) => t.pattern).join("; ");
    lines.push(`| \`${skill.id}\` | ${when} |`);
  }

  lines.push("");
  lines.push("## Universal rules");
  lines.push("- Prefer the most specific skill for the task.");
  lines.push("- If no skill matches, follow the project's general conventions.");
  lines.push("- Do not bypass explicit approval gates encoded in skill workflows.");
  lines.push("");

  return result(".github/copilot-instructions.md", lines.join("\n"), false);
}

export const copilotPlugin: HarnessPlugin = {
  id: "copilot",
  label: "GitHub Copilot",
  description: "GitHub Copilot - .github/instructions/*.instructions.md + copilot-instructions.md",
  renderSkill: renderCopilotSkill,
  renderProjectInstructions: renderCopilotProjectInstructions,
};
