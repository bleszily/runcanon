import { aiderPlugin } from "./aider.js";
import { antigravityPlugin } from "./antigravity.js";
import { browserPlugin } from "./browser.js";
import { claudePlugin } from "./claude.js";
import { codexPlugin } from "./codex.js";
import { continuePlugin } from "./continue.js";
import { copilotPlugin } from "./copilot.js";
import { cursorPlugin } from "./cursor.js";
import {
  amazonQPlugin,
  clinePlugin,
  geminiPlugin,
  jetbrainsPlugin,
  rooPlugin,
  zedPlugin,
} from "./extra.js";
import { getHarnessPlugin, registerHarness } from "./registry.js";
import { windsurfPlugin } from "./windsurf.js";

import type { Harness, HarnessRenderResult, Skill } from "../types.js";

export { buildAgentSkillMarkdown, buildProjectInstructionsMarkdown, buildSkillDescription } from "./agent-skills.js";
export { renderClaudeProjectInstructions, renderClaudeSkill, claudePlugin } from "./claude.js";
export { renderCopilotProjectInstructions, renderCopilotSkill, copilotPlugin } from "./copilot.js";
export { renderCursorProjectInstructions, renderCursorSkill, cursorPlugin } from "./cursor.js";
export { codexPlugin, renderCodexProjectInstructions, renderCodexSkill } from "./codex.js";
export { antigravityPlugin } from "./antigravity.js";
export { browserPlugin } from "./browser.js";
export { continuePlugin } from "./continue.js";
export { windsurfPlugin } from "./windsurf.js";
export { aiderPlugin } from "./aider.js";
export {
  amazonQPlugin,
  clinePlugin,
  geminiPlugin,
  jetbrainsPlugin,
  rooPlugin,
  zedPlugin,
} from "./extra.js";
export {
  getHarnessPlugin,
  isKnownHarness,
  registerHarness,
  registeredHarnesses,
  type HarnessPlugin,
} from "./registry.js";

/** Register all built-in harness plugins. */
function registerBuiltInHarnesses(): void {
  const plugins = [
    claudePlugin,
    cursorPlugin,
    copilotPlugin,
    continuePlugin,
    windsurfPlugin,
    codexPlugin,
    aiderPlugin,
    antigravityPlugin,
    browserPlugin,
    geminiPlugin,
    clinePlugin,
    rooPlugin,
    amazonQPlugin,
    jetbrainsPlugin,
    zedPlugin,
  ];
  for (const plugin of plugins) {
    registerHarness(plugin);
  }
}

registerBuiltInHarnesses();

/** Render a single skill for a target harness. */
export function renderSkillForHarness(harness: Harness, skill: Skill): HarnessRenderResult[] {
  const plugin = getHarnessPlugin(harness);
  if (!plugin) {
    throw new Error(`No renderer available for harness: ${harness}`);
  }
  return plugin.renderSkill(skill);
}

/** Render project-level instructions for a target harness. */
export function renderProjectInstructionsForHarness(harness: Harness, skills: Skill[]): HarnessRenderResult | null {
  const plugin = getHarnessPlugin(harness);
  return plugin?.renderProjectInstructions?.(skills) ?? null;
}

/** Render a skill for all configured harnesses. */
export function renderSkill(skill: Skill): HarnessRenderResult[] {
  const results: HarnessRenderResult[] = [];
  for (const harness of skill.harnesses) {
    try {
      results.push(...renderSkillForHarness(harness, skill));
    } catch {
      continue;
    }
  }
  return results;
}

/** Render project instructions for all configured harnesses across the skill set. */
export function renderProjectInstructions(skills: Skill[]): HarnessRenderResult[] {
  const harnesses = new Set<Harness>(skills.flatMap((s) => s.harnesses));
  const results: HarnessRenderResult[] = [];
  for (const harness of harnesses) {
    const rendered = renderProjectInstructionsForHarness(harness, skills);
    if (rendered) {
      results.push(rendered);
    }
  }
  return results;
}
