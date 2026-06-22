import { buildAgentSkillMarkdown, buildProjectInstructionsMarkdown } from "./agent-skills.js";
import { renderWorkflowMarkdown, result } from "./shared.js";

import type { HarnessRenderResult, Skill } from "../types.js";
import type { HarnessPlugin } from "./registry.js";

/** Google Gemini CLI - `GEMINI.md` + `.gemini/skills/{id}/SKILL.md`. */
export function renderGeminiSkill(skill: Skill): HarnessRenderResult[] {
  return [result(`.gemini/skills/${skill.id}/SKILL.md`, buildAgentSkillMarkdown(skill))];
}

export function renderGeminiProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result("GEMINI.md", buildProjectInstructionsMarkdown(skills, "Gemini Project Skills"), false);
}

export const geminiPlugin: HarnessPlugin = {
  id: "gemini",
  label: "Google Gemini CLI",
  description: "Gemini CLI - GEMINI.md + .gemini/skills/*/SKILL.md",
  renderSkill: renderGeminiSkill,
  renderProjectInstructions: renderGeminiProjectInstructions,
};

/** Cline - `.clinerules/{id}.md` plain markdown rules. */
export function renderClineSkill(skill: Skill): HarnessRenderResult[] {
  const globs = skill.triggers.flatMap((t) => t.globs ?? []);
  const header = globs.length > 0 ? `<!-- paths: ${globs.join(", ")} -->\n\n` : "";
  const body = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
  ].join("\n");
  return [result(`.clinerules/${skill.id}.md`, header + body)];
}

export const clinePlugin: HarnessPlugin = {
  id: "cline",
  label: "Cline",
  description: "Cline - .clinerules/*.md path-scoped rules",
  renderSkill: renderClineSkill,
};

/** Roo Code - `.roo/rules-code/{id}.md` mode-aware rules. */
export function renderRooSkill(skill: Skill): HarnessRenderResult[] {
  const body = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
  ].join("\n");
  return [result(`.roo/rules-code/${skill.id}.md`, body)];
}

export const rooPlugin: HarnessPlugin = {
  id: "roo",
  label: "Roo Code",
  description: "Roo Code - .roo/rules-code/*.md mode rules",
  renderSkill: renderRooSkill,
};

/** Amazon Q Developer - `.amazonq/rules/{id}.md`. */
export function renderAmazonQSkill(skill: Skill): HarnessRenderResult[] {
  const body = [
    `# ${skill.name}`,
    "",
    "## Purpose",
    skill.description,
    "",
    "## Instructions",
    renderWorkflowMarkdown(skill),
    "",
  ].join("\n");
  return [result(`.amazonq/rules/${skill.id}.md`, body)];
}

export const amazonQPlugin: HarnessPlugin = {
  id: "amazon-q",
  label: "Amazon Q Developer",
  description: "Amazon Q - .amazonq/rules/*.md",
  renderSkill: renderAmazonQSkill,
};

/** JetBrains AI Assistant - `.aiassistant/rules/{id}.md`. */
export function renderJetbrainsSkill(skill: Skill): HarnessRenderResult[] {
  const body = [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Workflow",
    renderWorkflowMarkdown(skill),
    "",
  ].join("\n");
  return [result(`.aiassistant/rules/${skill.id}.md`, body)];
}

export const jetbrainsPlugin: HarnessPlugin = {
  id: "jetbrains",
  label: "JetBrains AI Assistant",
  description: "JetBrains AI - .aiassistant/rules/*.md",
  renderSkill: renderJetbrainsSkill,
};

/** Zed - AGENTS.md standard + `.zed/skills/{id}/SKILL.md`. */
export function renderZedSkill(skill: Skill): HarnessRenderResult[] {
  return [result(`.zed/skills/${skill.id}/SKILL.md`, buildAgentSkillMarkdown(skill))];
}

export function renderZedProjectInstructions(skills: Skill[]): HarnessRenderResult {
  return result("AGENTS.md", buildProjectInstructionsMarkdown(skills, "Zed Agent Skills"), false);
}

export const zedPlugin: HarnessPlugin = {
  id: "zed",
  label: "Zed",
  description: "Zed editor - AGENTS.md + .zed/skills/*/SKILL.md",
  renderSkill: renderZedSkill,
  renderProjectInstructions: renderZedProjectInstructions,
};
