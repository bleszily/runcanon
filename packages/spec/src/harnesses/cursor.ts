import yaml from "js-yaml";

import { renderExamplesMarkdown, renderPreconditionsMarkdown, renderValidationMarkdown, renderWorkflowMarkdown, result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/**
 * Render a RunCanon skill for Cursor.
 *
 * Output:
 * - .cursor/skills/{skillId}/SKILL.md
 * - .cursor/rules/{skillId}.mdc for always-apply or glob-scoped rules
 */
export function renderCursorSkill(skill: Skill): HarnessRenderResult[] {
  const results: HarnessRenderResult[] = [];

  // Skill file
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
    when_to_use: skill.triggers.map((trigger) => trigger.pattern),
  };

  if (skill.invocation?.disableModelInvocation) {
    frontmatter.disable_model_invocation = true;
  }

  if (skill.triggers.some((t) => t.globs?.length)) {
    const globs = skill.triggers.flatMap((t) => t.globs ?? []);
    if (globs.length > 0) {
      frontmatter.paths = globs;
    }
  }

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

  const skillContent = ["---", yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", bodyLines.join("\n")].join("\n");
  results.push(result(`.cursor/skills/${skill.id}/SKILL.md`, skillContent));

  // Project rule file if the skill has globs or is alwaysApply
  const hasGlobs = skill.triggers.some((t) => t.globs?.length);
  const alwaysApply = skill.triggers.some((t) => t.alwaysApply);
  if (hasGlobs || alwaysApply) {
    const ruleFrontmatter: Record<string, unknown> = {
      description: skill.description,
    };

    if (alwaysApply) {
      ruleFrontmatter.alwaysApply = true;
    } else {
      const globs = skill.triggers.flatMap((t) => t.globs ?? []);
      ruleFrontmatter.globs = globs;
    }

    const ruleBody = [`# ${skill.name}`, "", skill.description, "", "## Workflow", renderWorkflowMarkdown(skill)].join("\n");
    const ruleContent = ["---", yaml.dump(ruleFrontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", ruleBody].join("\n");
    results.push(result(`.cursor/rules/${skill.id}.mdc`, ruleContent));
  }

  return results;
}

/**
 * Render an aggregated Cursor rules file from active skills.
 */
export function renderCursorProjectInstructions(skills: Skill[]): HarnessRenderResult {
  const lines: string[] = [];
  lines.push("# Project Skills");
  lines.push("");
  lines.push("When a request matches one of these workflows, apply the corresponding skill.");
  lines.push("");

  for (const skill of skills.filter((s) => s.status === "active")) {
    lines.push(`## ${skill.name}`);
    lines.push("");
    lines.push(skill.description);
    lines.push("");
    lines.push("**Triggers:**");
    for (const trigger of skill.triggers) {
      lines.push(`- ${trigger.pattern}`);
    }
    lines.push("");
  }

  return result("AGENTS.md", lines.join("\n"), false);
}

export const cursorPlugin: HarnessPlugin = {
  id: "cursor",
  label: "Cursor",
  description: "Cursor - .cursor/skills/*/SKILL.md + .cursor/rules/*.mdc + AGENTS.md",
  renderSkill: renderCursorSkill,
  renderProjectInstructions: renderCursorProjectInstructions,
};
