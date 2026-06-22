/** Public dashboard URL shown in Guide/Settings (Docker-friendly). */
export function publicServerUrl(url: URL): string {
  const fromEnv = process.env.RUNCANON_PUBLIC_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    return `http://${url.host}`;
  }
  return `${url.protocol}//${url.host}`;
}

/** Harness options engineers can enable in workspace config. */
export const ENGINEER_HARNESS_OPTIONS = [
  { id: "claude", label: "Claude Code", package: "@runcanon/harness-claude" },
  { id: "cursor", label: "Cursor", package: "@runcanon/harness-cursor" },
  { id: "copilot", label: "GitHub Copilot", package: "@runcanon/harness-copilot" },
  { id: "codex", label: "OpenAI Codex", package: "@runcanon/harness-openai" },
] as const;
