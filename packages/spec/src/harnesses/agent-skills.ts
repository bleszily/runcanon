import yaml from "js-yaml";

import {
  renderExamplesMarkdown,
  renderPreconditionsMarkdown,
  renderValidationMarkdown,
  renderWorkflowMarkdown,
} from "./shared.js";

import type { Skill } from "../types.js";

/** Build agentskills.io-compatible SKILL.md frontmatter and body. */
export function buildAgentSkillMarkdown(skill: Skill, extraFrontmatter: Record<string, unknown> = {}): string {
  const frontmatter: Record<string, unknown> = {
    name: skill.id,
    description: buildSkillDescription(skill),
    ...extraFrontmatter,
  };

  if (skill.invocation?.allowedTools?.length) {
    frontmatter["allowed-tools"] = skill.invocation.allowedTools.join(" ");
  }

  if (skill.harnesses.length > 0) {
    frontmatter.metadata = {
      ...(typeof frontmatter.metadata === "object" && frontmatter.metadata !== null
        ? (frontmatter.metadata as Record<string, unknown>)
        : {}),
      "runcanon-version": String(skill.version),
      harnesses: skill.harnesses.join(","),
      tags: skill.tags.join(","),
    };
  }

  const bodyLines: string[] = [`# ${skill.name}`, "", skill.description, ""];

  if (skill.preconditions.length > 0) {
    bodyLines.push("## Preconditions", renderPreconditionsMarkdown(skill), "");
  }

  bodyLines.push("## Workflow", "Follow these steps exactly:", "", renderWorkflowMarkdown(skill), "");

  if (skill.validation.length > 0) {
    bodyLines.push("## Validation", "Before completing, verify:", "", renderValidationMarkdown(skill), "");
  }

  if (skill.examples.length > 0) {
    bodyLines.push("## Examples", "", renderExamplesMarkdown(skill), "");
  }

  bodyLines.push("---", "");
  bodyLines.push(
    `*RunCanon v${String(skill.version)} · generated ${skill.metrics.generatedAt} · sample size ${String(skill.metrics.sampleSize)}*`,
    ""
  );

  return ["---", yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd(), "---", "", bodyLines.join("\n")].join(
    "\n"
  );
}

/** Compose a trigger-rich description for semantic skill activation. */
export function buildSkillDescription(skill: Skill): string {
  const triggers = skill.triggers.map((t) => t.pattern).filter(Boolean);
  const base = skill.description.trim();
  if (triggers.length === 0) {
    return base;
  }
  return `${base} Use when: ${triggers.join("; ")}.`;
}

/** Render aggregated project instructions as markdown sections. */
export function buildProjectInstructionsMarkdown(skills: Skill[], title = "Project Skills"): string {
  const lines: string[] = [`# ${title}`, "", "This project uses RunCanon-generated skills. When a request matches a workflow below, load the corresponding skill instead of improvising.", ""];

  const active = skills.filter((s) => s.status === "active");
  if (active.length === 0) {
    lines.push("_No active skills yet._", "");
    return lines.join("\n");
  }

  lines.push("| Skill | When to use |", "|-------|-------------|");
  for (const skill of active) {
    const when = skill.triggers.map((t) => t.pattern).join("; ") || skill.description;
    lines.push(`| \`${skill.id}\` | ${when} |`);
  }

  lines.push("", "## Universal rules", "- Prefer the most specific skill for the task.", "- If no skill matches, follow the project's general conventions.", "- Do not bypass explicit approval gates encoded in skill workflows.", "");
  return lines.join("\n");
}
