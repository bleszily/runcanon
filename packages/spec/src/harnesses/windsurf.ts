import yaml from "js-yaml";

import { renderWorkflowMarkdown, renderValidationMarkdown, result } from "./shared.js";
import { buildProjectInstructionsMarkdown } from "./agent-skills.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** Windsurf / Codeium Cascade - `.windsurf/rules/{id}.md` with trigger frontmatter. */
export function renderWindsurfSkill(skill: Skill): HarnessRenderResult[] {
  const alwaysApply = skill.triggers.some((t) => t.alwaysApply);
  const globs = skill.triggers.flatMap((t) => t.globs ?? []);

  const frontmatter: Record<string, unknown> = {
    description: skill.description,
    trigger: alwaysApply ? "always_on" : globs.length > 0 ? "glob" : "model_decision",
  };

  if (globs.length > 0) {
    frontmatter.globs = globs;
  }

  const body = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
    skill.validation.length > 0 ? `## Validation\n${renderValidationMarkdown(skill)}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return [
    result(
      `.windsurf/rules/${skill.id}.md`,
      ["---", yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", body].join("\n")
    ),
  ];
}

export function renderWindsurfProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result(".windsurf/AGENTS.md", buildProjectInstructionsMarkdown(skills, "Windsurf Skills"), false);
}

export const windsurfPlugin: HarnessPlugin = {
  id: "windsurf",
  label: "Windsurf / Cascade",
  description: "Windsurf - .windsurf/rules/*.md with trigger frontmatter",
  renderSkill: renderWindsurfSkill,
  renderProjectInstructions: renderWindsurfProjectInstructions,
};
