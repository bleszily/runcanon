import type { HarnessRenderResult, Skill } from "../types.js";

/** Render a workflow as a numbered markdown list. */
export function renderWorkflowMarkdown(skill: Skill): string {
  return skill.workflow
    .map((step, index) => {
      const lines: string[] = [`${String(step.id ?? index + 1)}. ${step.instruction}`];
      if (step.action) lines.push(`   - Invoke: \`${step.action}\``);
      if (step.preconditions?.length) lines.push(`   - Preconditions: ${step.preconditions.join("; ")}`);
      if (step.expectedOutcome) lines.push(`   - Expected outcome: ${step.expectedOutcome}`);
      if (step.requiresApproval) lines.push(`   - ⚠️ Requires explicit user approval.`);
      return lines.join("\n");
    })
    .join("\n");
}

/** Render preconditions as a markdown list. */
export function renderPreconditionsMarkdown(skill: Skill): string {
  if (skill.preconditions.length === 0) return "";
  return skill.preconditions.map((p) => `- ${p}`).join("\n");
}

/** Render examples as markdown. */
export function renderExamplesMarkdown(skill: Skill): string {
  return skill.examples
    .map((example) => {
      const lines: string[] = [`**User:** ${example.prompt}`, ``, `**RunCanon plan:** ${example.plan}`];
      if (example.output) {
        lines.push("", "**Example output:**", "```", example.output, "```");
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Render validation rules as markdown. */
export function renderValidationMarkdown(skill: Skill): string {
  return skill.validation.map((rule) => `- **[${rule.severity.toUpperCase()}]** ${rule.description}`).join("\n");
}

/** Determine whether a skill is globally applicable (always active). */
export function isAlwaysApply(skill: Skill): boolean {
  return skill.triggers.some((trigger) => trigger.alwaysApply === true);
}

/** Format a date for display. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Create a base HarnessRenderResult with given path and content. */
export function result(path: string, content: string, overwrite = true): HarnessRenderResult {
  return { path, content, overwrite };
}
