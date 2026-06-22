import { buildAgentSkillMarkdown, buildProjectInstructionsMarkdown } from "./agent-skills.js";
import { result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** Google Antigravity - `.agents/skills/{id}/SKILL.md` + `.agents/AGENTS.md`. */
export function renderAntigravitySkill(skill: Skill): HarnessRenderResult[] {
  return [result(`.agents/skills/${skill.id}/SKILL.md`, buildAgentSkillMarkdown(skill))];
}

export function renderAntigravityProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result(".agents/AGENTS.md", buildProjectInstructionsMarkdown(skills, "Project Skills (Antigravity)"), false);
}

export const antigravityPlugin: HarnessPlugin = {
  id: "antigravity",
  label: "Google Antigravity",
  description: "Antigravity IDE/CLI - .agents/skills/*/SKILL.md + .agents/AGENTS.md",
  renderSkill: renderAntigravitySkill,
  renderProjectInstructions: renderAntigravityProjectInstructions,
};
