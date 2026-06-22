import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import yaml from "js-yaml";
import { z } from "zod";

import type { LlmProviderConfig } from "./llm/provider.js";
import { readEnv } from "./env.js";
import { resolveProjectDataDir } from "./paths.js";

const autonomyLevelSchema = z.enum(["suggest", "ask", "doAndShow", "doAndDigest"]);

const skillsmithConfigSchema = z.object({
  project: z.string().min(1),
  workspace: z.string().optional(),
  scope: z.array(z.string().min(1)).default(["workspace-wide"]),
  goals: z.array(z.string().min(1)).default([]),
  harnesses: z
    .array(
      z.enum([
        "claude",
        "cursor",
        "copilot",
        "continue",
        "windsurf",
        "codex",
        "openai",
        "aider",
        "antigravity",
        "browser",
        "coworker",
        "browseros",
        "gemini",
        "cline",
        "roo",
        "amazon-q",
        "jetbrains",
        "zed",
      ])
    )
    .default(["claude"]),
  autonomy: autonomyLevelSchema.default("ask"),
  llm: z
    .object({
      provider: z.enum(["anthropic", "openai", "ollama", "generic", "grok", "vertex", "bedrock"]),
      baseUrl: z.string().optional(),
      apiKey: z.string().optional(),
      model: z.string().min(1),
      maxTokens: z.number().int().positive().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
  telemetry: z
    .object({
      enabled: z.boolean().default(true),
      retentionDays: z.number().int().positive().default(90),
      storagePath: z.string().default(".runcanon/trajectories"),
    })
    .default({}),
  mining: z
    .object({
      schedule: z.enum(["manual", "hourly", "daily", "weekly"]).default("manual"),
      minClusterSize: z.number().int().positive().default(2),
      distanceThreshold: z.number().min(0).max(1).default(0.45),
    })
    .default({}),
});

export type SkillsmithConfig = z.infer<typeof skillsmithConfigSchema>;

export interface ResolvedConfig extends SkillsmithConfig {
  projectPath: string;
  skillsDir: string;
  proposedDir: string;
  activeDir: string;
  registryPath: string;
}

export function parseConfig(raw: unknown): SkillsmithConfig {
  return skillsmithConfigSchema.parse(raw);
}

export async function loadConfig(projectPath: string): Promise<ResolvedConfig> {
  let raw: unknown = {};
  const configCandidates = ["runcanon.config.yaml", "skillsmith.config.yaml"];
  let loaded = false;
  for (const name of configCandidates) {
    try {
      const content = await readFile(join(projectPath, name), "utf-8");
      raw = yaml.load(content);
      loaded = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }
  if (!loaded) {
    raw = {};
  }

  const config = parseConfig(raw);
  const baseDir = await resolveProjectDataDir(projectPath);
  return {
    ...config,
    projectPath,
    skillsDir: join(baseDir, "skills"),
    proposedDir: join(baseDir, "skills", "proposed"),
    activeDir: join(baseDir, "skills", "active"),
    registryPath: join(baseDir, "skills-index.json"),
  };
}

export async function saveConfig(projectPath: string, config: SkillsmithConfig): Promise<void> {
  const configPath = join(projectPath, "runcanon.config.yaml");
  const content = yaml.dump(config, { sortKeys: false, lineWidth: 120, noRefs: true });
  await writeFile(configPath, content, "utf-8");
}

function llmConfigFromEnv(): LlmProviderConfig | undefined {
  const model = readEnv("RUNCANON_LLM_MODEL", "RUNCANON_LLM_MODEL");
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: model ?? "claude-sonnet-4-20250514",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      maxTokens: readEnv("RUNCANON_LLM_MAX_TOKENS", "RUNCANON_LLM_MAX_TOKENS")
        ? Number.parseInt(readEnv("RUNCANON_LLM_MAX_TOKENS", "RUNCANON_LLM_MAX_TOKENS")!, 10)
        : undefined,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: model ?? "gpt-4o",
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
    };
  }
  if (process.env.XAI_API_KEY) {
    return {
      provider: "grok",
      model: model ?? "grok-3",
      apiKey: process.env.XAI_API_KEY,
      baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    };
  }
  if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
    return {
      provider: "vertex",
      model: model ?? "gemini-2.0-flash",
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
    };
  }
  if (process.env.AWS_REGION) {
    return {
      provider: "bedrock",
      model: model ?? "anthropic.claude-3-5-sonnet-20241022-v2:0",
      region: process.env.AWS_REGION,
    };
  }
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_API_KEY) {
    return {
      provider: "ollama",
      model: model ?? "llama3.2",
      baseUrl: process.env.OLLAMA_HOST ?? "http://localhost:11434",
      apiKey: process.env.OLLAMA_API_KEY,
    };
  }
  return undefined;
}

export function configToLlmProviderConfig(config: SkillsmithConfig): LlmProviderConfig | undefined {
  if (config.llm) {
    return {
      provider: config.llm.provider,
      baseUrl: config.llm.baseUrl,
      apiKey: config.llm.apiKey ?? envApiKeyForProvider(config.llm.provider),
      model: config.llm.model,
      maxTokens: config.llm.maxTokens,
      temperature: config.llm.temperature,
    };
  }
  return llmConfigFromEnv();
}

function envApiKeyForProvider(provider: LlmProviderConfig["provider"]): string | undefined {
  switch (provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "openai":
    case "grok":
      return process.env.OPENAI_API_KEY ?? process.env.XAI_API_KEY;
    case "vertex":
      return process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    case "bedrock":
      return undefined;
    case "ollama":
      return process.env.OLLAMA_API_KEY;
    default:
      return readEnv("RUNCANON_LLM_API_KEY", "RUNCANON_LLM_API_KEY");
  }
}
