import { buildAgentSkillMarkdown, buildProjectInstructionsMarkdown } from "./agent-skills.js";
import { result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/**
 * Browser-based agent harnesses (BrowserOS, Coworker, and agentskills.io clients).
 * Uses the portable Agent Skills directory layout at `skills/{id}/SKILL.md`.
 */
export function renderBrowserSkill(skill: Skill): HarnessRenderResult[] {
  const extra: Record<string, unknown> = {
    metadata: {
      "display-name": skill.name,
      enabled: "true",
      version: String(skill.version),
    },
  };

  if (skill.invocation?.allowedTools?.length) {
    extra["allowed-tools"] = skill.invocation.allowedTools.join(" ");
  }

  return [result(`skills/${skill.id}/SKILL.md`, buildAgentSkillMarkdown(skill, extra))];
}

export function renderBrowserProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result("AGENTS.md", buildProjectInstructionsMarkdown(skills, "Browser Agent Skills"), false);
}

export const browserPlugin: HarnessPlugin = {
  id: "browser",
  label: "Browser Agent (BrowserOS / Coworker)",
  description: "Browser-based agents - skills/{id}/SKILL.md (Agent Skills standard)",
  aliases: ["coworker", "browseros"],
  renderSkill: renderBrowserSkill,
  renderProjectInstructions: renderBrowserProjectInstructions,
};
