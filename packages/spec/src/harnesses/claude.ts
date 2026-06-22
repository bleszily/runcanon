import yaml from "js-yaml";

import { renderExamplesMarkdown, renderPreconditionsMarkdown, renderValidationMarkdown, renderWorkflowMarkdown, result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/**
 * Render a RunCanon skill for Claude Code.
 *
 * Output:
 * - .claude/skills/{skillId}/SKILL.md
 */
export function renderClaudeSkill(skill: Skill): HarnessRenderResult[] {
  const frontmatter: Record<string, unknown> = {
    name: skill.name,
    description: skill.description,
    when_to_use: skill.triggers.map((trigger) => trigger.pattern),
  };

  if (skill.invocation?.argumentHint) {
    frontmatter.argument_hint = skill.invocation.argumentHint;
  }

  if (skill.invocation?.disableModelInvocation) {
    frontmatter.disable_model_invocation = true;
  }

  if (skill.invocation?.userInvocable === false) {
    frontmatter.user_invocable = false;
  }

  if (skill.invocation?.allowedTools?.length) {
    frontmatter.allowed_tools = skill.invocation.allowedTools;
  }

  if (skill.invocation?.disallowedTools?.length) {
    frontmatter.disallowed_tools = skill.invocation.disallowedTools;
  }

  if (skill.triggers.some((t) => t.globs?.length)) {
    const globs = skill.triggers.flatMap((t) => t.globs ?? []);
    if (globs.length > 0) {
      frontmatter.paths = globs;
    }
  }

  if (skill.invocation?.model) {
    frontmatter.model = skill.invocation.model;
  }

  if (skill.invocation?.effort) {
    frontmatter.effort = skill.invocation.effort;
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
  bodyLines.push("Follow these steps exactly:");
  bodyLines.push("");
  bodyLines.push(renderWorkflowMarkdown(skill));
  bodyLines.push("");

  if (skill.validation.length > 0) {
    bodyLines.push("## Validation");
    bodyLines.push("Before completing, verify:");
    bodyLines.push("");
    bodyLines.push(renderValidationMarkdown(skill));
    bodyLines.push("");
  }

  if (skill.examples.length > 0) {
    bodyLines.push("## Examples");
    bodyLines.push("");
    bodyLines.push(renderExamplesMarkdown(skill));
    bodyLines.push("");
  }

  bodyLines.push("---");
  bodyLines.push("");
  bodyLines.push(`*RunCanon v${String(skill.version)} · generated ${skill.metrics.generatedAt} · sample size ${String(skill.metrics.sampleSize)}*`);
  bodyLines.push("");

  const content = ["---", yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", bodyLines.join("\n")].join("\n");

  return [result(`.claude/skills/${skill.id}/SKILL.md`, content)];
}

/**
 * Render an aggregated CLAUDE.md snippet from active skills.
 *
 * This is a single file that contains concise project instructions derived from
 * the skill library. It does not replace individual skill files; it complements them.
 */
export function renderClaudeProjectInstructions(skills: Skill[]): HarnessRenderResult {
  const lines: string[] = [];
  lines.push("# Project Skills");
  lines.push("");
  lines.push("This project uses RunCanon-generated skills. When a user request matches one of the workflows below, invoke the corresponding skill from `.claude/skills/` instead of improvising.");
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

  return result("CLAUDE.md", lines.join("\n"), false);
}

export const claudePlugin: HarnessPlugin = {
  id: "claude",
  label: "Claude Code",
  description: "Anthropic Claude Code - .claude/skills/*/SKILL.md + CLAUDE.md",
  renderSkill: renderClaudeSkill,
  renderProjectInstructions: renderClaudeProjectInstructions,
};
