import { z } from "zod";

export const userRoleSchema = z.enum(["admin", "curator", "engineer", "viewer"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/** Dashboard approver maps to engineer; curator is org skill publisher. */
export type DashboardRole = UserRole | "approver";

export const llmProviderIdSchema = z.enum(["anthropic", "openai", "grok", "vertex", "bedrock", "ollama"]);
export type LlmProviderId = z.infer<typeof llmProviderIdSchema>;

/** Legacy provider ids stored in older platform.json files. */
export const LEGACY_LLM_PROVIDER_IDS = ["codex", "antigravity"] as const;

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: userRoleSchema,
  passwordHash: z.string().min(1),
  /** When true, user must set a new password before using the app. */
  mustResetPassword: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

export const sessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  token: z.string().min(32),
  expiresAt: z.string(),
  createdAt: z.string(),
  userAgent: z.string().optional(),
});

export type Session = z.infer<typeof sessionSchema>;

export const apiTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  tokenHash: z.string().min(1),
  prefix: z.string().length(8),
  expiresAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
  createdAt: z.string(),
});

export type ApiToken = z.infer<typeof apiTokenSchema>;

export const cliAuthChallengeSchema = z.object({
  id: z.string().uuid(),
  state: z.string().min(16),
  redirectUri: z.string().url(),
  userId: z.string().uuid().optional(),
  exchangeCodeHash: z.string().optional(),
  cliToken: z
    .object({
      token: z.string().min(1),
      prefix: z.string().length(8),
      expiresAt: z.string(),
    })
    .optional(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type CliAuthChallenge = z.infer<typeof cliAuthChallengeSchema>;

export const providerConfigSchema = z.object({
  id: llmProviderIdSchema,
  label: z.string().min(1),
  enabled: z.boolean(),
  model: z.string().min(1),
  baseUrl: z.string().optional(),
  region: z.string().optional(),
  projectId: z.string().optional(),
  location: z.string().optional(),
  /** AES-256-GCM ciphertext (base64). Empty when not configured. */
  encryptedSecret: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string(),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const workspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  ownerId: z.string().uuid(),
  /** Server-side storage root for this workspace (under RUNCANON_DATA_DIR). */
  storagePath: z.string().min(1),
  isDefault: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const userPreferenceSchema = z.object({
  userId: z.string().uuid(),
  activeWorkspaceId: z.string().uuid(),
});

export type UserPreference = z.infer<typeof userPreferenceSchema>;

export const platformStoreSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  users: z.array(userSchema),
  sessions: z.array(sessionSchema),
  apiTokens: z.array(apiTokenSchema),
  cliAuthChallenges: z.array(cliAuthChallengeSchema).default([]),
  providers: z.array(providerConfigSchema),
  workspaces: z.array(workspaceSchema),
  userPreferences: z.array(userPreferenceSchema).default([]),
  defaultWorkspaceId: z.string().uuid().optional(),
});

export type PlatformStore = z.infer<typeof platformStoreSchema>;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  mustResetPassword: boolean;
}

export interface AdminUserView extends PublicUser {
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser extends PublicUser {
  authenticated: true;
}

export const PROVIDER_CATALOG: Record<
  LlmProviderId,
  {
    label: string;
    defaultModel: string;
    defaultBaseUrl?: string;
    secretLabel: string;
    secretPlaceholder?: string;
    helpText?: string;
  }
> = {
  anthropic: {
    label: "Anthropic Claude",
    defaultModel: "claude-sonnet-4-20250514",
    secretLabel: "API key",
  },
  openai: {
    label: "OpenAI",
    defaultModel: "gpt-4o",
    defaultBaseUrl: "https://api.openai.com/v1",
    secretLabel: "API key",
  },
  grok: {
    label: "xAI Grok",
    defaultModel: "grok-3",
    defaultBaseUrl: "https://api.x.ai/v1",
    secretLabel: "API key",
  },
  vertex: {
    label: "Google Vertex / Gemini",
    defaultModel: "gemini-2.0-flash",
    secretLabel: "API key or service account JSON",
    secretPlaceholder: "AI Studio API key, or paste service account JSON for Vertex",
    helpText: "Set project ID and location for Vertex AI. API key uses Google AI Studio.",
  },
  bedrock: {
    label: "AWS Bedrock",
    defaultModel: "anthropic.claude-3-5-sonnet-20241022-v2:0",
    secretLabel: "AWS credentials JSON (optional on EC2/EKS with IAM role)",
    secretPlaceholder: '{"accessKeyId":"...","secretAccessKey":"..."}',
    helpText: "Uses Bedrock Converse API. Set AWS region below. Leave secret empty when using instance IAM role.",
  },
  ollama: {
    label: "Ollama (local or cloud)",
    defaultModel: "gpt-oss:120b",
    defaultBaseUrl: "http://localhost:11434",
    secretLabel: "API key (optional for local; required for Ollama Cloud)",
    secretPlaceholder: "Paste key from ollama.com/settings/keys for cloud",
    helpText:
      "Local: http://localhost:11434 (Docker: http://host.docker.internal:11434). Ollama Cloud: use https://ollama.com with your cloud API key — models load automatically when a key is saved.",
  },
};

export const PACKAGE_GUIDE = [
  {
    id: "core",
    package: "@runcanon/core",
    summary: "Episode segmentation, clustering, skill generation, and scoring.",
    setup: "Installed with the RunCanon monorepo or Docker image. Powers mining on the server.",
  },
  {
    id: "spec",
    package: "@runcanon/spec",
    summary: "Portable skill schema, validators, and harness renderers.",
    setup: "Shared types used by CLI, dashboard, and MCP. No separate install when using Docker.",
  },
  {
    id: "cli",
    package: "@runcanon/cli",
    summary: "Command-line interface for init, mine, review, and export.",
    setup: "Run `runcanon login --server http://127.0.0.1:3000 --email you@company.com` then `runcanon mine` to sync trajectories to your workspace.",
  },
  {
    id: "mcp",
    package: "@runcanon/mcp",
    summary: "MCP server exposing skill management tools to agents.",
    setup: "Configure in Cursor/Claude Desktop with stdio or point agents at the hosted dashboard API.",
  },
  {
    id: "dashboard",
    package: "@runcanon/dashboard",
    summary: "Web UI for skills, proposals, trajectories, and admin settings.",
    setup: "Access after login. Configure harnesses under Settings or Guide. Admins configure LLM keys under Providers.",
  },
  {
    id: "harness-claude",
    package: "@runcanon/harness-claude",
    summary: "Export to `.claude/skills/*/SKILL.md` and `CLAUDE.md`.",
    setup: "Enable `claude` in Settings harnesses, then Export from dashboard or `runcanon export -h all`.",
  },
  {
    id: "harness-cursor",
    package: "@runcanon/harness-cursor",
    summary: "Export to `.cursor/skills/*/SKILL.md`, rules, and `AGENTS.md`.",
    setup: "Enable `cursor` in harnesses. Pull exported files into your repo after approval.",
  },
  {
    id: "harness-copilot",
    package: "@runcanon/harness-copilot",
    summary: "Export to GitHub Copilot `.github/instructions/*.instructions.md`.",
    setup: "Enable `copilot` in harnesses and export to your repository.",
  },
  {
    id: "harness-openai",
    package: "@runcanon/harness-openai",
    summary: "Export to Codex/OpenAI `.codex/skills/*/SKILL.md` and `AGENTS.md`.",
    setup: "Enable `codex` or `openai` in harnesses. Requires OpenAI provider configured by admin.",
  },
] as const;
