import type { ClusterSummary, SkillGenerationProvider } from "../generation.js";
import type { Skill } from "@runcanon/spec";

/**
 * Multi-provider LLM abstraction for RunCanon.
 *
 * Supports Anthropic, OpenAI, Ollama-compatible local servers, and any
 * generic HTTP endpoint that speaks an OpenAI-compatible chat completions API.
 */

/** A chat message. */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for a completion request. */
export interface LlmCompletionOptions {
  messages: LlmMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
}

/** Result of a completion request. */
export interface LlmCompletionResult {
  content: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/** Base interface every LLM provider must implement. */
export interface LlmProvider {
  readonly name: string;
  complete(options: LlmCompletionOptions): Promise<LlmCompletionResult>;
}

/** Configuration for an LLM provider. */
export interface LlmProviderConfig {
  provider: "anthropic" | "openai" | "ollama" | "generic" | "grok" | "vertex" | "bedrock";
  /** API base URL. Optional for Anthropic/OpenAI; required for Ollama/generic. */
  baseUrl?: string;
  /** API key, bearer token, or JSON credentials (Bedrock keys / GCP service account). */
  apiKey?: string;
  /** Model identifier. */
  model: string;
  /** Default max tokens for completions. */
  maxTokens?: number;
  /** Default temperature. */
  temperature?: number;
  /** AWS region for Bedrock. */
  region?: string;
  /** GCP project for Vertex AI. */
  projectId?: string;
  /** GCP location for Vertex AI (e.g. us-central1). */
  location?: string;
}

/** A skill generation prompt builder. */
export function buildSkillGenerationPrompt(summary: ClusterSummary, goals: string[]): LlmCompletionOptions {
  const system = `You are RunCanon, an expert workflow miner for AI coding agents.
Your job is to convert a discovered cluster of agent trajectories into a clean, reusable skill definition.

A skill is a portable workflow recipe with:
- a concise id (kebab-case), name, and description
- triggers: natural-language patterns that activate the skill
- preconditions: what must be true before starting
- workflow: ordered numbered steps, each with an instruction and optional action/tool name
- validation: rules that verify the workflow completed correctly
- examples: 1-2 example user prompts and the high-level plan

Project goals:
${goals.length > 0 ? goals.map((g) => `- ${g}`).join("\n") : "- Maintain high-quality, secure, consistent AI-assisted workflows."}

Respond with ONLY a JSON object matching this TypeScript shape:
{
  "id": string,
  "name": string,
  "description": string,
  "preconditions": string[],
  "workflow": { "id"?: string, "instruction": string, "action"?: string, "expectedOutcome"?: string }[],
  "validation": { "description": string, "severity": "error" | "warning" }[],
  "examples": { "prompt": string, "plan": string }[],
  "tags": string[]
}

Do not include markdown formatting around the JSON.`;

  const user = `Discovered cluster summary:
- inferred name: ${summary.name}
- inferred description: ${summary.description}
- number of episodes: ${String(summary.size)}
- success rate: ${(summary.successRate * 100).toFixed(1)}%
- representative action signature: ${summary.actionSignature.join(" → ")}
- example user intents:
${summary.exemplarIntents.slice(0, 5).map((intent) => `  * ${intent}`).join("\n")}

Generate the skill JSON.`;

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    maxTokens: 2048,
  };
}

/** Extract JSON from a model response that may include markdown fences. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- preserve generic return type for callers
export function extractJson<T>(text: string): T {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*$/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("No JSON object found in LLM response");
  }
  return JSON.parse(match[0]) as T;
}

/** Ollama Cloud API host (see https://docs.ollama.com/api/authentication). */
export const OLLAMA_CLOUD_BASE_URL = "https://ollama.com";
export const OLLAMA_LOCAL_BASE_URL = "http://localhost:11434";

/** Use Ollama Cloud when an API key is set and base URL is still the local default. */
export function resolveOllamaBaseUrl(baseUrl?: string, apiKey?: string): string {
  const trimmed = baseUrl?.trim().replace(/\/$/, "");
  const isLocalDefault =
    !trimmed ||
    trimmed === OLLAMA_LOCAL_BASE_URL ||
    trimmed === "http://127.0.0.1:11434" ||
    trimmed === "https://localhost:11434";

  if (apiKey?.trim() && isLocalDefault) {
    return OLLAMA_CLOUD_BASE_URL;
  }

  return trimmed || OLLAMA_LOCAL_BASE_URL;
}

export function createLlmProvider(config: LlmProviderConfig): LlmProvider {
  const { provider } = config;
  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(config);
    case "openai":
      return new OpenAiProvider(config);
    case "grok":
      return new OpenAiProvider({ ...config, baseUrl: config.baseUrl ?? "https://api.x.ai/v1" });
    case "ollama":
      return new OllamaProvider(config);
    case "vertex":
      return new VertexGeminiProvider(config);
    case "bedrock":
      return new BedrockProvider(config);
    case "generic":
      return new GenericOpenAiProvider(config);
    default:
      throw new Error(`Unknown LLM provider: ${String(provider)}`);
  }
}

/** Anthropic provider. */
class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const apiKey = this.config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Anthropic provider requires apiKey or ANTHROPIC_API_KEY environment variable");
    }

    const response = await fetch(this.config.baseUrl ?? "https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: options.maxTokens ?? this.config.maxTokens ?? 2048,
        temperature: options.temperature ?? this.config.temperature ?? 0.3,
        system: options.messages.find((m) => m.role === "system")?.content,
        messages: options.messages.filter((m) => m.role !== "system"),
        stop_sequences: options.stopSequences,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error ${String(response.status)}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = body.content.map((c) => ("text" in c ? c.text : "")).join("");
    return {
      content: text,
      model: body.model,
      usage: {
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
      },
    };
  }
}

/** OpenAI provider. */
class OpenAiProvider implements LlmProvider {
  readonly name = "openai";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI provider requires apiKey or OPENAI_API_KEY environment variable");
    }

    const response = await fetch(this.config.baseUrl ?? "https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? this.config.maxTokens ?? 2048,
        temperature: options.temperature ?? this.config.temperature ?? 0.3,
        top_p: options.topP,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error ${String(response.status)}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      content: body.choices[0]?.message?.content ?? "",
      model: body.model,
      usage: {
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
      },
    };
  }
}

/** Ollama provider (OpenAI-compatible /api/chat endpoint). */
class OllamaProvider implements LlmProvider {
  readonly name = "ollama";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const baseUrl = resolveOllamaBaseUrl(this.config.baseUrl, this.config.apiKey);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: options.messages,
        stream: false,
        options: {
          temperature: options.temperature ?? this.config.temperature ?? 0.3,
          num_predict: options.maxTokens ?? this.config.maxTokens ?? 2048,
          stop: options.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error ${String(response.status)}: ${await response.text()}`);
    }

    const body = (await response.json()) as { message?: { content: string }; eval_count?: number; prompt_eval_count?: number };

    return {
      content: body.message?.content ?? "",
      usage: {
        inputTokens: body.prompt_eval_count,
        outputTokens: body.eval_count,
      },
    };
  }
}

/** Generic OpenAI-compatible chat completions provider. */
class GenericOpenAiProvider implements LlmProvider {
  readonly name = "generic";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    if (!this.config.baseUrl) {
      throw new Error("Generic provider requires baseUrl");
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const base = this.config.baseUrl?.replace(/\/$/, "") ?? "";
    const path = base.endsWith("/v1") ? "/chat/completions" : "/v1/chat/completions";
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages: options.messages,
        max_tokens: options.maxTokens ?? this.config.maxTokens ?? 2048,
        temperature: options.temperature ?? this.config.temperature ?? 0.3,
        stop: options.stopSequences,
      }),
    });

    if (!response.ok) {
      throw new Error(`Generic LLM API error ${String(response.status)}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    return {
      content: body.choices[0]?.message?.content ?? "",
      model: body.model,
      usage: {
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
      },
    };
  }
}

/** Google Vertex AI / Gemini (API key or Vertex endpoint). */
class VertexGeminiProvider implements LlmProvider {
  readonly name = "vertex";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const apiKey = this.config.apiKey;
    const projectId = this.config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT;
    const location = this.config.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
    const model = this.config.model;

    const userText = options.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    if (projectId && apiKey?.trim().startsWith("{")) {
      const { GoogleGenAI } = await import("@google/genai");
      const credentials = JSON.parse(apiKey) as Record<string, unknown>;
      const ai = new GoogleGenAI({
        vertexai: true,
        project: projectId,
        location,
        googleAuthOptions: { credentials },
      });
      const resp = await ai.models.generateContent({
        model,
        contents: userText,
      });
      return { content: resp.text ?? "" };
    }

    if (projectId && !apiKey) {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ vertexai: true, project: projectId, location });
      const resp = await ai.models.generateContent({ model, contents: userText });
      return { content: resp.text ?? "" };
    }

    if (!apiKey) {
      throw new Error("Vertex/Gemini provider requires an API key or service account JSON in the secret field");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userText }] }],
        generationConfig: {
          temperature: options.temperature ?? this.config.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? this.config.maxTokens ?? 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error ${String(response.status)}: ${await response.text()}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return { content: text };
  }
}

/** AWS Bedrock via Converse API (Claude, Llama, etc.). */
class BedrockProvider implements LlmProvider {
  readonly name = "bedrock";
  constructor(private readonly config: LlmProviderConfig) {}

  async complete(options: LlmCompletionOptions): Promise<LlmCompletionResult> {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const region = this.config.region ?? process.env.AWS_REGION ?? "us-east-1";

    let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined;
    if (this.config.apiKey?.trim().startsWith("{")) {
      const parsed = JSON.parse(this.config.apiKey) as {
        accessKeyId?: string;
        secretAccessKey?: string;
        sessionToken?: string;
      };
      if (parsed.accessKeyId && parsed.secretAccessKey) {
        credentials = {
          accessKeyId: parsed.accessKeyId,
          secretAccessKey: parsed.secretAccessKey,
          sessionToken: parsed.sessionToken,
        };
      }
    }

    const client = new BedrockRuntimeClient({ region, credentials });

    const messages = options.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: [{ text: m.content }],
      }));

    const system = options.messages.find((m) => m.role === "system")?.content;

    const command = new ConverseCommand({
      modelId: this.config.model,
      system: system ? [{ text: system }] : undefined,
      messages,
      inferenceConfig: {
        maxTokens: options.maxTokens ?? this.config.maxTokens ?? 2048,
        temperature: options.temperature ?? this.config.temperature ?? 0.3,
      },
    });

    const result = await client.send(command);
    const text =
      result.output?.message?.content?.map((block) => ("text" in block ? block.text : "")).join("") ?? "";

    return {
      content: text,
      model: this.config.model,
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
    };
  }
}

/** LLM-backed skill generation provider. */
export class LlmSkillGenerationProvider implements SkillGenerationProvider {
  constructor(
    private readonly llm: LlmProvider,
    private readonly goals: string[] = []
  ) {}

  async generateSkill(summary: ClusterSummary): Promise<Partial<Skill>> {
    const options = buildSkillGenerationPrompt(summary, this.goals);
    const result = await this.llm.complete(options);
    const parsed = extractJson<Partial<Skill>>(result.content);
    return parsed;
  }
}
