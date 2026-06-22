import yaml from "js-yaml";

import { renderExamplesMarkdown, renderValidationMarkdown, renderWorkflowMarkdown, result } from "./shared.js";
import { buildProjectInstructionsMarkdown } from "./agent-skills.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** Continue.dev - `.continue/skills/{id}/SKILL.md` + `.continue/rules/{id}.md`. */
export function renderContinueSkill(skill: Skill): HarnessRenderResult[] {
  const results: HarnessRenderResult[] = [];

  const skillFm: Record<string, unknown> = {
    name: skill.id,
    description: skill.description,
  };
  const skillBody = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
    skill.validation.length > 0 ? `## Validation\n${renderValidationMarkdown(skill)}\n` : "",
    skill.examples.length > 0 ? `## Examples\n${renderExamplesMarkdown(skill)}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");

  results.push(
    result(
      `.continue/skills/${skill.id}/SKILL.md`,
      ["---", yaml.dump(skillFm, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", skillBody].join("\n")
    )
  );

  const hasGlobs = skill.triggers.some((t) => t.globs?.length);
  const alwaysApply = skill.triggers.some((t) => t.alwaysApply);
  if (hasGlobs || alwaysApply) {
    const ruleFm: Record<string, unknown> = { description: skill.description };
    if (alwaysApply) ruleFm.alwaysApply = true;
    else ruleFm.globs = skill.triggers.flatMap((t) => t.globs ?? []);

    const ruleBody = [`# ${skill.name}`, "", skill.description, "", "## Workflow", renderWorkflowMarkdown(skill)].join("\n");
    results.push(
      result(
        `.continue/rules/${skill.id}.md`,
        ["---", yaml.dump(ruleFm, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", ruleBody].join("\n")
      )
    );
  }

  return results;
}

export function renderContinueProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result(".continue/AGENTS.md", buildProjectInstructionsMarkdown(skills, "Continue.dev Skills"), false);
}

export const continuePlugin: HarnessPlugin = {
  id: "continue",
  label: "Continue.dev",
  description: "Continue.dev - .continue/skills/*/SKILL.md + .continue/rules/*.md",
  renderSkill: renderContinueSkill,
  renderProjectInstructions: renderContinueProjectInstructions,
};
