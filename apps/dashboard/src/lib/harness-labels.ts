import type { HarnessType } from "$lib/types";

/** Human-readable labels for known harness ids. */
export const HARNESS_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  codex: "OpenAI Codex",
  openai: "OpenAI Codex",
  continue: "Continue",
  windsurf: "Windsurf",
  aider: "Aider",
  antigravity: "Antigravity",
  browser: "Browser",
  coworker: "Coworker",
  browseros: "BrowserOS",
  gemini: "Gemini",
  cline: "Cline",
  roo: "Roo Code",
  "amazon-q": "Amazon Q",
  jetbrains: "JetBrains",
  zed: "Zed",
};

export function formatHarnessLabel(id: string): string {
  return HARNESS_DISPLAY_NAMES[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Map spec harness ids to dashboard icon categories for filters and glyphs. */
export function harnessToIconCategory(id: string): HarnessType {
  if (id === "browser" || id === "coworker" || id === "browseros") return "browser";
  if (id === "aider" || id === "codex" || id === "openai" || id === "cline") return "cli";
  if (id === "antigravity" || id === "gemini" || id === "amazon-q") return "api";
  return "code";
}
