import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { decryptSecret, encryptSecret, slugify } from "./crypto.js";
import { mutateStore, readStore, workspacesDir } from "./store.js";
import type { LlmProviderId, ProviderConfig, Workspace } from "./types.js";
import { PROVIDER_CATALOG } from "./types.js";
import { PROJECT_DATA_DIRNAME, resolveOllamaBaseUrl } from "@runcanon/core";

export type ProviderPublic = Omit<ProviderConfig, "encryptedSecret"> & {
  configured: boolean;
  hasSecret: boolean;
};

function toPublicProvider(provider: ProviderConfig): ProviderPublic {
  const { encryptedSecret, ...rest } = provider;
  return {
    ...rest,
    configured: Boolean(encryptedSecret),
    hasSecret: Boolean(encryptedSecret),
  };
}

export async function listProviders(): Promise<ProviderPublic[]> {
  const store = await readStore();
  const byId = new Map(store.providers.map((p) => [p.id, p]));

  return (Object.keys(PROVIDER_CATALOG) as LlmProviderId[]).map((id) => {
    const existing = byId.get(id);
    if (existing) return toPublicProvider(existing);
    const catalog = PROVIDER_CATALOG[id];
    return {
      id,
      label: catalog.label,
      enabled: false,
      model: catalog.defaultModel,
      baseUrl: catalog.defaultBaseUrl,
      configured: false,
      hasSecret: false,
      updatedAt: new Date(0).toISOString(),
      updatedBy: "system",
    };
  });
}

export async function upsertProvider(
  id: LlmProviderId,
  input: {
    enabled: boolean;
    model: string;
    baseUrl?: string;
    region?: string;
    projectId?: string;
    location?: string;
    secret?: string;
    updatedBy: string;
  }
): Promise<ProviderPublic> {
  const catalog = PROVIDER_CATALOG[id];
  const now = new Date().toISOString();

  return mutateStore((store) => {
    const idx = store.providers.findIndex((p) => p.id === id);
    const previous = idx >= 0 ? store.providers[idx] : undefined;
    const encryptedSecret =
      input.secret !== undefined && input.secret.length > 0
        ? encryptSecret(input.secret)
        : (previous?.encryptedSecret ?? "");

    const secretForResolve =
      input.secret !== undefined && input.secret.length > 0
        ? input.secret
        : previous?.encryptedSecret
          ? decryptSecret(previous.encryptedSecret)
          : undefined;

    const resolvedBaseUrl =
      id === "ollama"
        ? resolveOllamaBaseUrl(input.baseUrl || previous?.baseUrl || catalog.defaultBaseUrl, secretForResolve)
        : input.baseUrl || catalog.defaultBaseUrl;

    const record: ProviderConfig = {
      id,
      label: catalog.label,
      enabled: input.enabled,
      model: input.model || catalog.defaultModel,
      baseUrl: resolvedBaseUrl,
      region: input.region,
      projectId: input.projectId,
      location: input.location,
      encryptedSecret,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };

    if (input.enabled) {
      for (const other of store.providers) {
        if (other.id !== id) {
          other.enabled = false;
        }
      }
    }

    if (idx >= 0) {
      store.providers[idx] = record;
    } else {
      store.providers.push(record);
    }

    return toPublicProvider(record);
  });
}

export async function getProviderSecret(id: LlmProviderId): Promise<string | undefined> {
  const store = await readStore();
  const provider = store.providers.find((p) => p.id === id && p.enabled);
  if (!provider?.encryptedSecret) return undefined;
  return decryptSecret(provider.encryptedSecret);
}

/** Resolve LLM config for mining from admin-managed providers (first enabled with secret or IAM). */
export async function resolveActiveLlmConfig(): Promise<
  import("@runcanon/core").LlmProviderConfig | undefined
> {
  const store = await readStore();
  for (const provider of store.providers.filter((p) => p.enabled)) {
    const secret = provider.encryptedSecret ? decryptSecret(provider.encryptedSecret) : undefined;
    const base = {
      model: provider.model,
      baseUrl: provider.baseUrl,
      apiKey: secret,
      region: provider.region,
      projectId: provider.projectId,
      location: provider.location,
    };

    switch (provider.id) {
      case "anthropic":
        if (!secret) continue;
        return { provider: "anthropic", ...base };
      case "openai":
        if (!secret) continue;
        return { provider: "openai", ...base };
      case "grok":
        if (!secret) continue;
        return { ...base, provider: "grok", baseUrl: provider.baseUrl ?? "https://api.x.ai/v1" };
      case "vertex":
        if (!secret && !provider.projectId) continue;
        return { provider: "vertex", ...base };
      case "bedrock":
        return { provider: "bedrock", apiKey: secret, region: provider.region, model: provider.model };
      case "ollama":
        return {
          provider: "ollama",
          model: provider.model,
          baseUrl: resolveOllamaBaseUrl(provider.baseUrl, secret),
          apiKey: secret,
        };
      default:
        continue;
    }
  }
  return undefined;
}

/** Build LLM config for a specific provider id (uses stored credentials). */
export async function resolveProviderLlmConfig(
  id: LlmProviderId,
  overrides?: {
    model?: string;
    baseUrl?: string;
    secret?: string;
    region?: string;
    projectId?: string;
    location?: string;
  }
): Promise<import("@runcanon/core").LlmProviderConfig | undefined> {
  const store = await readStore();
  const provider = store.providers.find((p) => p.id === id);
  const catalog = PROVIDER_CATALOG[id];

  const storedSecret = provider?.encryptedSecret ? decryptSecret(provider.encryptedSecret) : undefined;
  const secret = overrides?.secret?.length ? overrides.secret : storedSecret;
  const baseUrl = overrides?.baseUrl ?? provider?.baseUrl ?? catalog.defaultBaseUrl;
  const model = overrides?.model ?? provider?.model ?? catalog.defaultModel;

  const base = {
    model,
    baseUrl,
    apiKey: secret,
    region: overrides?.region ?? provider?.region,
    projectId: overrides?.projectId ?? provider?.projectId,
    location: overrides?.location ?? provider?.location,
  };

  switch (id) {
    case "anthropic":
      if (!secret) return undefined;
      return { provider: "anthropic", ...base };
    case "openai":
      if (!secret) return undefined;
      return { provider: "openai", ...base };
    case "grok":
      if (!secret) return undefined;
      return { ...base, provider: "grok", baseUrl: baseUrl ?? "https://api.x.ai/v1" };
    case "vertex":
      if (!secret && !base.projectId) return undefined;
      return { provider: "vertex", ...base };
    case "bedrock":
      return { provider: "bedrock", apiKey: secret, region: base.region, model };
    case "ollama":
      return {
        provider: "ollama",
        model,
        baseUrl: resolveOllamaBaseUrl(baseUrl, secret),
        apiKey: secret,
      };
    default:
      return undefined;
  }
}

/** List models from a provider using stored or override credentials. */
export async function listProviderModelOptions(
  id: LlmProviderId,
  overrides?: {
    baseUrl?: string;
    secret?: string;
    region?: string;
    projectId?: string;
    location?: string;
  }
): Promise<{ models: import("@runcanon/core").LlmModelOption[] }> {
  const config = await resolveProviderLlmConfig(id, overrides);
  if (!config) {
    throw new Error("Configure an API key or credentials before listing models");
  }

  const { listProviderModels } = await import("@runcanon/core");
  const models = await listProviderModels(config);
  return { models };
}

async function runLlmSmokeTest(
  config: import("@runcanon/core").LlmProviderConfig
): Promise<{ ok: true; provider: string; model: string } | { ok: false; error: string }> {
  try {
    const { createLlmProvider } = await import("@runcanon/core");
    const provider = createLlmProvider(config);
    const result = await provider.complete({
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      maxTokens: 16,
      temperature: 0,
    });
    if (!result.content.trim()) {
      return { ok: false, error: "LLM returned an empty response" };
    }
    return { ok: true, provider: config.provider, model: config.model };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function testProviderConnection(
  id: LlmProviderId,
  overrides?: {
    model?: string;
    baseUrl?: string;
    secret?: string;
    region?: string;
    projectId?: string;
    location?: string;
  }
): Promise<{ ok: true; provider: string; model: string } | { ok: false; error: string }> {
  const config = await resolveProviderLlmConfig(id, overrides);
  if (!config) {
    return {
      ok: false,
      error: "Add an API key (or Ollama cloud token) before testing this provider.",
    };
  }
  return runLlmSmokeTest(config);
}

export async function testActiveLlmConnection(): Promise<
  { ok: true; provider: string; model: string } | { ok: false; error: string }
> {
  const config = await resolveActiveLlmConfig();
  if (!config) {
    return {
      ok: false,
      error:
        "No active provider saved. Check Enabled on a provider, click Save provider, then test again.",
    };
  }

  return runLlmSmokeTest(config);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const store = await readStore();
  return store.workspaces;
}

export async function getDefaultWorkspace(): Promise<Workspace | undefined> {
  const store = await readStore();
  if (store.defaultWorkspaceId) {
    return store.workspaces.find((w) => w.id === store.defaultWorkspaceId);
  }
  return store.workspaces.find((w) => w.isDefault) ?? store.workspaces[0];
}

export async function createWorkspace(input: {
  name: string;
  description?: string;
  ownerId: string;
  isDefault?: boolean;
}): Promise<Workspace> {
  const now = new Date().toISOString();
  const id = randomUUID();
  const slug = slugify(input.name) || id.slice(0, 8);
  const storagePath = join(workspacesDir(), slug);

  await mkdir(storagePath, { recursive: true });
  await mkdir(join(storagePath, PROJECT_DATA_DIRNAME, "trajectories"), { recursive: true });
  await mkdir(join(storagePath, PROJECT_DATA_DIRNAME, "skills", "active"), { recursive: true });
  await mkdir(join(storagePath, PROJECT_DATA_DIRNAME, "skills", "proposed"), { recursive: true });
  await mkdir(join(storagePath, PROJECT_DATA_DIRNAME, "registry", "proposed"), { recursive: true });

  const workspace: Workspace = {
    id,
    name: input.name.trim(),
    slug,
    description: input.description,
    ownerId: input.ownerId,
    storagePath,
    isDefault: input.isDefault ?? false,
    createdAt: now,
    updatedAt: now,
  };

  return mutateStore((store) => {
    if (input.isDefault) {
      for (const w of store.workspaces) w.isDefault = false;
      store.defaultWorkspaceId = id;
    }
    store.workspaces.push(workspace);
    if (!store.defaultWorkspaceId) {
      store.defaultWorkspaceId = id;
    }
    return workspace;
  });
}

export async function setDefaultWorkspace(workspaceId: string): Promise<Workspace> {
  return mutateStore((store) => {
    const workspace = store.workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    for (const w of store.workspaces) w.isDefault = false;
    workspace.isDefault = true;
    workspace.updatedAt = new Date().toISOString();
    store.defaultWorkspaceId = workspaceId;
    return workspace;
  });
}

export async function findWorkspaceById(id: string): Promise<Workspace | undefined> {
  const store = await readStore();
  return store.workspaces.find((w) => w.id === id);
}
