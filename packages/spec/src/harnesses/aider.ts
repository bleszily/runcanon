import { renderWorkflowMarkdown, renderValidationMarkdown, renderPreconditionsMarkdown, result } from "./shared.js";
import { buildProjectInstructionsMarkdown } from "./agent-skills.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** Aider - `.aider/skills/{id}.md` + aggregated `CONVENTIONS.md`. */
export function renderAiderSkill(skill: Skill): HarnessRenderResult[] {
  const content = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    skill.preconditions.length > 0 ? `## Preconditions\n${renderPreconditionsMarkdown(skill)}\n` : "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
    skill.validation.length > 0 ? `## Validation\n${renderValidationMarkdown(skill)}\n` : "",
    "---",
    "",
    `_RunCanon skill ${skill.id} v${String(skill.version)}_`,
    "",
  ]
    .filter(Boolean)
    .join("\n");

  return [result(`.aider/skills/${skill.id}.md`, content)];
}

export function renderAiderProjectInstructions(skills: Skill[]): HarnessRenderResult {
  const lines = [
    "# Aider Conventions",
    "",
    "Load skill files from `.aider/skills/` with `--read` or include in your aider config.",
    "",
    buildProjectInstructionsMarkdown(skills, "Available Skills"),
  ];
  return result("CONVENTIONS.md", lines.join("\n"), false);
}

export const aiderPlugin: HarnessPlugin = {
  id: "aider",
  label: "Aider",
  description: "Aider - .aider/skills/*.md + CONVENTIONS.md aggregate",
  renderSkill: renderAiderSkill,
  renderProjectInstructions: renderAiderProjectInstructions,
};
