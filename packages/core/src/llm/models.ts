import type { LlmProviderConfig } from "./provider.js";
import { resolveOllamaBaseUrl } from "./provider.js";

export interface LlmModelOption {
  id: string;
  label?: string;
}

/** List models available from a configured LLM provider. */
export async function listProviderModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  switch (config.provider) {
    case "anthropic":
      return listAnthropicModels(config);
    case "openai":
    case "grok":
    case "generic":
      return listOpenAiCompatibleModels(config);
    case "ollama":
      return listOllamaModels(config);
    case "vertex":
      return listVertexModels(config);
    case "bedrock":
      return listBedrockModels(config);
    default:
      return [];
  }
}

async function listAnthropicModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key is required to list models");
  }

  const base = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/models`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    throw new Error(`Anthropic models API error ${String(response.status)}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    data?: Array<{ id: string; display_name?: string }>;
  };

  return (body.data ?? [])
    .map((m) => ({ id: m.id, label: m.display_name ?? m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listOpenAiCompatibleModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is required to list models");
  }

  const defaultBase =
    config.provider === "grok" ? "https://api.x.ai/v1" : "https://api.openai.com/v1";
  const base = (config.baseUrl ?? defaultBase).replace(/\/$/, "");
  const modelsPath = base.endsWith("/v1") ? "/models" : "/v1/models";

  const response = await fetch(`${base}${modelsPath}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`Models API error ${String(response.status)}: ${await response.text()}`);
  }

  const body = (await response.json()) as { data?: Array<{ id: string }> };
  return (body.data ?? [])
    .map((m) => ({ id: m.id, label: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listOllamaModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  const baseUrl = resolveOllamaBaseUrl(config.baseUrl, config.apiKey);
  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/tags`, { headers });
  } catch (error) {
    const hint =
      config.apiKey && baseUrl === resolveOllamaBaseUrl(undefined, config.apiKey)
        ? " Check that your Ollama Cloud API key is valid and Base URL is https://ollama.com."
        : config.apiKey
          ? " For Ollama Cloud, set Base URL to https://ollama.com."
          : " For local Ollama in Docker, try http://host.docker.internal:11434.";
    throw new Error(`Could not reach Ollama at ${baseUrl}.${hint} (${(error as Error).message})`);
  }
  if (!response.ok) {
    throw new Error(`Ollama models API error ${String(response.status)}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    models?: Array<{ name: string; details?: { family?: string; parameter_size?: string } }>;
  };

  return (body.models ?? [])
    .map((m) => ({
      id: m.name,
      label: m.details?.parameter_size ? `${m.name} (${m.details.parameter_size})` : m.name,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listVertexModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  const apiKey = config.apiKey;
  if (!apiKey) {
    throw new Error("API key or service account JSON is required to list Vertex/Gemini models");
  }

  if (apiKey.trim().startsWith("{")) {
    const projectId = config.projectId ?? process.env.GOOGLE_CLOUD_PROJECT;
    const location = config.location ?? process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
    if (!projectId) {
      throw new Error("Project ID is required to list Vertex models with service account credentials");
    }
    const { GoogleGenAI } = await import("@google/genai");
    const credentials = JSON.parse(apiKey) as Record<string, unknown>;
    const ai = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location,
      googleAuthOptions: { credentials },
    });
    const pager = await ai.models.list();
    const models: LlmModelOption[] = [];
    for await (const model of pager) {
      const id = model.name?.split("/").pop() ?? model.name ?? "";
      if (id) models.push({ id, label: model.displayName ?? id });
    }
    return models.sort((a, b) => a.id.localeCompare(b.id));
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
  );
  if (!response.ok) {
    throw new Error(`Gemini models API error ${String(response.status)}: ${await response.text()}`);
  }

  const body = (await response.json()) as {
    models?: Array<{ name: string; displayName?: string }>;
  };

  return (body.models ?? [])
    .map((m) => {
      const id = m.name.replace(/^models\//, "");
      return { id, label: m.displayName ?? id };
    })
    .filter((m) => m.id.includes("gemini"))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function listBedrockModels(config: LlmProviderConfig): Promise<LlmModelOption[]> {
  const { BedrockClient, ListFoundationModelsCommand } = await import("@aws-sdk/client-bedrock");
  const region = config.region ?? process.env.AWS_REGION ?? "us-east-1";

  let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined;
  if (config.apiKey?.trim().startsWith("{")) {
    const parsed = JSON.parse(config.apiKey) as {
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

  const client = new BedrockClient({ region, credentials });
  const result = await client.send(new ListFoundationModelsCommand({}));
  return (result.modelSummaries ?? [])
    .filter((m) => m.modelLifecycle?.status === "ACTIVE" || !m.modelLifecycle)
    .map((m) => ({
      id: m.modelId ?? "",
      label: m.modelName ?? m.modelId,
    }))
    .filter((m) => m.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}
