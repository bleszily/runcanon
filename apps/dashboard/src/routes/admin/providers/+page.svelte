<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";
  import type { LlmProviderId } from "@runcanon/platform";

  interface ModelOption {
    id: string;
    label?: string;
  }

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let saving = $state<string | null>(null);
  let secrets = $state<Record<string, string>>({});
  let models = $state<Record<string, string>>(
    Object.fromEntries(
      data.providers.map((p) => [p.id, p.model || data.catalog[p.id].defaultModel])
    )
  );
  let baseUrls = $state<Record<string, string>>(
    Object.fromEntries(
      data.providers.map((p) => {
        const url = p.baseUrl ?? "";
        if (p.id === "ollama" && p.hasSecret && (!url || url === "http://localhost:11434")) {
          return [p.id, "https://ollama.com"];
        }
        return [p.id, url];
      })
    )
  );
  let enabled = $state<Record<string, boolean>>(
    Object.fromEntries(data.providers.map((p) => [p.id, p.enabled]))
  );
  let availableModels = $state<Record<string, ModelOption[]>>({});
  let loadingModels = $state<Record<string, boolean>>({});
  let modelErrors = $state<Record<string, string>>({});
  let customModel = $state<Record<string, boolean>>({});
  let testingLlm = $state(false);
  let testingProvider = $state<string | null>(null);
  let testResult = $state<{ ok: boolean; message: string } | null>(null);
  let providerTestResults = $state<Record<string, { ok: boolean; message: string }>>({});

  function savedModel(providerId: LlmProviderId): string {
    const p = data.providers.find((x) => x.id === providerId);
    return p?.model || data.catalog[providerId].defaultModel;
  }

  function isDirty(providerId: LlmProviderId): boolean {
    const p = data.providers.find((x) => x.id === providerId);
    if (!p) return false;
    return (
      enabled[providerId] !== p.enabled ||
      models[providerId] !== savedModel(providerId) ||
      (baseUrls[providerId] ?? "") !== (p.baseUrl ?? "") ||
      Boolean(secrets[providerId]?.trim())
    );
  }

  function setEnabled(providerId: LlmProviderId, value: boolean) {
    enabled = { ...enabled, [providerId]: value };
    if (value) {
      for (const p of data.providers) {
        if (p.id !== providerId) {
          enabled = { ...enabled, [p.id]: false };
        }
      }
    }
  }

  const hasUnsavedActive = $derived(
    data.providers.some((p) => enabled[p.id] && (isDirty(p.id) || !p.enabled))
  );

  function canListModels(providerId: string, hasSecret: boolean): boolean {
    if (providerId === "ollama") return true;
    if (providerId === "bedrock") return true;
    return hasSecret || Boolean(secrets[providerId]?.trim());
  }

  async function fetchModels(providerId: LlmProviderId, hasSecret: boolean) {
    if (!canListModels(providerId, hasSecret)) return;

    loadingModels = { ...loadingModels, [providerId]: true };
    modelErrors = { ...modelErrors, [providerId]: "" };

    try {
      const secret = secrets[providerId]?.trim();
      const baseUrl = baseUrls[providerId]?.trim();
      const usePost = Boolean(secret) || Boolean(baseUrl);

      const res = usePost
        ? await apiFetch(`/api/admin/providers/${providerId}/models`, {
            method: "POST",
            body: JSON.stringify({
              secret: secret || undefined,
              baseUrl: baseUrl || undefined,
            }),
          })
        : await apiFetch(`/api/admin/providers/${providerId}/models`);

      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // keep raw text
        }
        throw new Error(message);
      }

      const body = (await res.json()) as { models: ModelOption[] };
      availableModels = { ...availableModels, [providerId]: body.models };

      const current = models[providerId];
      const ids = body.models.map((m) => m.id);
      if (current && ids.includes(current)) {
        customModel = { ...customModel, [providerId]: false };
      } else if (body.models.length > 0 && (!current || !ids.includes(current))) {
        models = { ...models, [providerId]: body.models[0].id };
        customModel = { ...customModel, [providerId]: false };
      }
    } catch (error) {
      modelErrors = {
        ...modelErrors,
        [providerId]: error instanceof Error ? error.message : "Failed to load models",
      };
    } finally {
      loadingModels = { ...loadingModels, [providerId]: false };
    }
  }

  onMount(() => {
    for (const provider of data.providers) {
      if (canListModels(provider.id, provider.hasSecret)) {
        void fetchModels(provider.id, provider.hasSecret);
      }
    }
  });

  async function testProviderConnection(id: LlmProviderId) {
    testingProvider = id;
    providerTestResults = { ...providerTestResults, [id]: { ok: false, message: "" } };
    try {
      const res = await apiFetch("/api/admin/providers/test", {
        method: "POST",
        body: JSON.stringify({
          id,
          model: models[id],
          baseUrl: baseUrls[id] || undefined,
          secret: secrets[id] || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; provider?: string; model?: string; error?: string };
      const message = body.ok
        ? `Connected to ${body.provider} (${body.model})`
        : (body.error ?? "Connection failed");
      providerTestResults = { ...providerTestResults, [id]: { ok: body.ok, message } };
      if (!body.ok) {
        toasts.error(message);
      } else {
        toasts.success(message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connection failed";
      providerTestResults = { ...providerTestResults, [id]: { ok: false, message } };
      toasts.error(message);
    } finally {
      testingProvider = null;
    }
  }

  async function testLlmConnection() {
    testingLlm = true;
    testResult = null;
    try {
      const res = await apiFetch("/api/admin/providers/test", { method: "POST" });
      const body = (await res.json()) as { ok: boolean; provider?: string; model?: string; error?: string };
      testResult = body.ok
        ? { ok: true, message: `Connected to ${body.provider} (${body.model})` }
        : { ok: false, message: body.error ?? "Connection failed" };
    } catch (error) {
      testResult = { ok: false, message: error instanceof Error ? error.message : "Connection failed" };
    } finally {
      testingLlm = false;
    }
  }

  function onOllamaSecretChange(providerId: LlmProviderId) {
    if (providerId !== "ollama" || !secrets[providerId]?.trim()) return;
    const current = baseUrls[providerId]?.trim();
    if (!current || current === "http://localhost:11434" || current === "http://127.0.0.1:11434") {
      baseUrls = { ...baseUrls, [providerId]: "https://ollama.com" };
    }
    void fetchModels(providerId, true);
  }

  async function saveProvider(id: LlmProviderId) {
    saving = id;
    try {
      const res = await apiFetch("/api/admin/providers", {
        method: "POST",
        body: JSON.stringify({
          id,
          enabled: enabled[id],
          model: models[id],
          baseUrl: baseUrls[id] || undefined,
          secret: secrets[id] || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`${id} provider saved`);
      secrets[id] = "";
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      saving = null;
    }
  }
</script>

<svelte:head>
  <title>LLM providers - RunCanon Admin</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">LLM providers</h1>
    <p class="text-[hsl(var(--muted-foreground))]">
      Admin-only. Check <strong>Enabled</strong>, pick a model, then click <strong>Save provider</strong> to activate.
      Use <strong>Test</strong> on each card to verify credentials before saving.
    </p>
    {#if hasUnsavedActive}
      <p class="mt-2 rounded-lg border border-[hsl(var(--destructive))]/30 bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
        You have unsaved provider changes. The top Test button only works after you save an enabled provider.
      </p>
    {/if}
  </div>

  <div class="card p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Active LLM connection</h2>
        <p class="text-sm text-[hsl(var(--muted-foreground))]">
          {#if data.activeLlm}
            Mining will use <span class="font-mono">{data.activeLlm.provider}</span> / {data.activeLlm.model}
          {:else}
            Enable a provider below and save an API key to activate LLM-powered skill generation.
          {/if}
        </p>
        {#if testResult}
          <p class="mt-2 text-sm {testResult.ok ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}">
            {testResult.message}
          </p>
        {/if}
      </div>
      <button class="btn btn-secondary gap-2" disabled={testingLlm} onclick={testLlmConnection}>
        <Icon name="cpu" size={16} />
        {testingLlm ? "Testing..." : "Test connection"}
      </button>
    </div>
  </div>

  <div class="space-y-4">
    {#each data.providers as provider}
      {@const catalog = data.catalog[provider.id]}
      {@const options = availableModels[provider.id] ?? []}
      {@const showCustom = customModel[provider.id] || (models[provider.id] && !options.some((m) => m.id === models[provider.id]))}
      <div class="card p-6">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-lg font-semibold">{provider.label}</h2>
            <p class="font-mono text-xs text-[hsl(var(--muted-foreground))]">{provider.id}</p>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled[provider.id]}
              onchange={(e) => setEnabled(provider.id, (e.currentTarget as HTMLInputElement).checked)}
            />
            Active provider
          </label>
        </div>

        {#if isDirty(provider.id)}
          <p class="mb-3 text-xs text-[hsl(var(--destructive))]">Unsaved changes — click Save provider to apply.</p>
        {:else if provider.enabled}
          <p class="mb-3 text-xs text-[hsl(var(--success))]">Active for mining and top-level connection test.</p>
        {/if}

        {#if providerTestResults[provider.id]?.message}
          <p class="mb-3 text-xs {providerTestResults[provider.id].ok ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'}">
            {providerTestResults[provider.id].message}
          </p>
        {/if}

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <div class="mb-2 flex items-center justify-between gap-2">
              <label class="text-sm font-medium" for="model-{provider.id}">Model</label>
              {#if canListModels(provider.id, provider.hasSecret)}
                <button
                  type="button"
                  class="text-xs text-[hsl(var(--primary))] hover:underline disabled:opacity-50"
                  disabled={loadingModels[provider.id]}
                  onclick={() => fetchModels(provider.id, provider.hasSecret)}
                >
                  {loadingModels[provider.id] ? "Loading..." : "Refresh models"}
                </button>
              {/if}
            </div>

            {#if options.length > 0 && !showCustom}
              <select
                id="model-{provider.id}"
                class="input w-full font-mono text-sm"
                bind:value={models[provider.id]}
              >
                {#each options as option}
                  <option value={option.id}>{option.label ?? option.id}</option>
                {/each}
              </select>
              <button
                type="button"
                class="mt-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                onclick={() => (customModel = { ...customModel, [provider.id]: true })}
              >
                Enter custom model id
              </button>
            {:else}
              <input
                id="model-{provider.id}"
                class="input w-full font-mono text-sm"
                bind:value={models[provider.id]}
                placeholder={catalog.defaultModel}
              />
              {#if options.length > 0}
                <button
                  type="button"
                  class="mt-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  onclick={() => (customModel = { ...customModel, [provider.id]: false })}
                >
                  Choose from list ({options.length} models)
                </button>
              {/if}
            {/if}

            {#if modelErrors[provider.id]}
              <p class="mt-1 text-xs text-[hsl(var(--destructive))]">{modelErrors[provider.id]}</p>
            {:else if loadingModels[provider.id]}
              <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Fetching models from provider...</p>
            {:else if options.length > 0}
              <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{options.length} models available</p>
            {:else if canListModels(provider.id, provider.hasSecret)}
              <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Save credentials or refresh to load models</p>
            {/if}
          </div>
          <div>
            <label class="mb-2 block text-sm font-medium" for="base-{provider.id}">Base URL (optional)</label>
            <input
              id="base-{provider.id}"
              class="input w-full font-mono text-sm"
              bind:value={baseUrls[provider.id]}
              placeholder={provider.id === "ollama" && (provider.hasSecret || secrets[provider.id]?.trim())
                ? "https://ollama.com"
                : (catalog.defaultBaseUrl ?? "")}
              onchange={() => {
                if (canListModels(provider.id, provider.hasSecret)) {
                  void fetchModels(provider.id, provider.hasSecret);
                }
              }}
            />
          </div>
        </div>

        <div class="mt-4">
          <label class="mb-2 block text-sm font-medium" for="secret-{provider.id}">
            {catalog.secretLabel}
            {#if provider.hasSecret}
              <span class="text-[hsl(var(--success))]">(configured)</span>
            {/if}
          </label>
          <input
            id="secret-{provider.id}"
            type="password"
            class="input w-full font-mono text-sm"
            bind:value={secrets[provider.id]}
            placeholder={provider.hasSecret ? "Leave blank to keep existing secret" : "Paste API key or token"}
            onchange={() => {
              if (provider.id === "ollama") onOllamaSecretChange(provider.id);
              else if (secrets[provider.id]?.trim()) {
                void fetchModels(provider.id, provider.hasSecret);
              }
            }}
          />
          {#if catalog.helpText}
            <p class="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{catalog.helpText}</p>
          {/if}
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button class="btn btn-primary gap-2" disabled={saving === provider.id} onclick={() => saveProvider(provider.id)}>
            <Icon name="check" size={16} />
            {saving === provider.id ? "Saving..." : "Save provider"}
          </button>
          {#if canListModels(provider.id, provider.hasSecret)}
            <button
              type="button"
              class="btn btn-secondary gap-2"
              disabled={testingProvider === provider.id}
              onclick={() => testProviderConnection(provider.id)}
            >
              <Icon name="cpu" size={16} />
              {testingProvider === provider.id ? "Testing..." : "Test"}
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
