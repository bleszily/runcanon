import { buildAgentSkillMarkdown, buildProjectInstructionsMarkdown } from "./agent-skills.js";
import { result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** OpenAI Codex CLI / IDE - AGENTS.md + `.codex/skills/{id}/SKILL.md`. */
export function renderCodexSkill(skill: Skill): HarnessRenderResult[] {
  const codexMeta: Record<string, unknown> = {};
  if (skill.invocation?.disableModelInvocation) {
    codexMeta.metadata = { "allow_implicit_invocation": "false" };
  }

  const results: HarnessRenderResult[] = [
    result(`.codex/skills/${skill.id}/SKILL.md`, buildAgentSkillMarkdown(skill, codexMeta)),
  ];

  // Optional Codex app metadata
  if (skill.invocation?.userInvocable !== false) {
    const openaiYaml = [
      "interface:",
      "  display_name:",
      `    value: ${JSON.stringify(skill.name)}`,
      "  short_description:",
      `    value: ${JSON.stringify(skill.description.slice(0, 120))}`,
      "policy:",
      "  allow_implicit_invocation:",
      `    value: ${skill.invocation?.disableModelInvocation ? "false" : "true"}`,
      "",
    ].join("\n");
    results.push(result(`.codex/skills/${skill.id}/agents/openai.yaml`, openaiYaml));
  }

  return results;
}

export function renderCodexProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result("AGENTS.md", buildProjectInstructionsMarkdown(skills, "Project Skills (Codex)"), false);
}

export const codexPlugin: HarnessPlugin = {
  id: "codex",
  label: "OpenAI Codex",
  description: "Codex CLI/IDE - AGENTS.md hierarchy + .codex/skills/*/SKILL.md",
  aliases: ["openai"],
  renderSkill: renderCodexSkill,
  renderProjectInstructions: renderCodexProjectInstructions,
};
