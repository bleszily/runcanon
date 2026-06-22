import yaml from "js-yaml";

import type { Skill, SkillRegistryIndex } from "./types.js";

/**
 * Serialize a canonical Skill to its canonical markdown representation.
 *
 * The canonical format is YAML frontmatter plus markdown sections.
 * This is the one file format that every harness transformer reads.
 */
export function serializeSkill(skill: Skill): string {
  const preconditions = Array.isArray(skill.preconditions) ? skill.preconditions : [];
  const workflow = Array.isArray(skill.workflow) ? skill.workflow : [];
  const validation = Array.isArray(skill.validation) ? skill.validation : [];
  const examples = Array.isArray(skill.examples) ? skill.examples : [];

  const frontmatter = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    version: skill.version,
    status: skill.status,
    scope: skill.scope,
    harnesses: skill.harnesses,
    tags: skill.tags,
    triggers: skill.triggers,
    invocation: skill.invocation,
    metrics: skill.metrics,
    metadata: skill.metadata,
  };

  const lines: string[] = [];
  lines.push("---");
  lines.push(yaml.dump(frontmatter, { sortKeys: false, lineWidth: 120, noRefs: true }).trimEnd());
  lines.push("---");
  lines.push("");

  if (preconditions.length > 0) {
    lines.push("## preconditions");
    for (const precondition of preconditions) {
      lines.push(`- ${precondition}`);
    }
    lines.push("");
  }

  lines.push("## workflow");
  for (const [index, step] of workflow.entries()) {
    const stepId = step.id ?? String(index + 1);
    lines.push(`${stepId}. **${step.instruction}**`);
    if (step.action) {
      lines.push(`   - Action: \`${step.action}\``);
    }
    if (step.preconditions && step.preconditions.length > 0) {
      lines.push(`   - Preconditions: ${step.preconditions.join("; ")}`);
    }
    if (step.expectedOutcome) {
      lines.push(`   - Expected outcome: ${step.expectedOutcome}`);
    }
    if (step.requiresApproval) {
      lines.push(`   - ⚠️ Requires explicit user approval.`);
    }
    lines.push("");
  }

  if (validation.length > 0) {
    lines.push("## validation");
    for (const rule of validation) {
      lines.push(`- [${rule.severity.toUpperCase()}] ${rule.description}`);
      if (rule.check) {
        lines.push(`  - Check: \`${rule.check}\``);
      }
    }
    lines.push("");
  }

  if (examples.length > 0) {
    lines.push("## examples");
    for (const example of examples) {
      lines.push(`### User: ${example.prompt}`);
      lines.push(`**Plan:** ${example.plan}`);
      if (example.output) {
        lines.push("");
        lines.push("**Output:**");
        lines.push("```");
        lines.push(example.output);
        lines.push("```");
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

/**
 * Serialize a skill registry index to JSON.
 */
export function serializeRegistryIndex(index: SkillRegistryIndex): string {
  return JSON.stringify(index, null, 2);
}
