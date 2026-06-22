<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { invalidateAll } from "$app/navigation";
  import { toasts } from "$lib/stores/toasts";
  import { apiFetch } from "$lib/api/fetch.js";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let mining = $state(false);
  let exporting = $state(false);
  let savingHarnesses = $state(false);
  let selectedHarnesses = $state<string[]>(data.config?.harnesses ?? ["claude", "cursor", "copilot", "codex"]);
  let workspaceName = $state("");
  let creatingWorkspace = $state(false);
  let switchingWorkspace = $state<string | null>(null);

  async function switchWorkspace(workspaceId: string) {
    switchingWorkspace = workspaceId;
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "PATCH",
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Active workspace updated");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to switch workspace");
    } finally {
      switchingWorkspace = null;
    }
  }

  async function readApiError(res: Response): Promise<string> {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { message?: string };
      if (body.message) return body.message;
    } catch {
      // not JSON
    }
    return text || `Request failed (${res.status})`;
  }

  async function runMining() {
    mining = true;
    toasts.info("Mining started — LLM analysis usually takes 2–5 minutes. Keep this tab open.");
    try {
      const res = await apiFetch("/api/mine", { method: "POST", body: "{}" });
      if (!res.ok) throw new Error(await readApiError(res));
      const body = (await res.json()) as { proposals: unknown[]; filesRead?: string[] };
      const filesNote = body.filesRead?.length ? ` from ${body.filesRead.length} file(s)` : "";
      toasts.success(`Mining complete: ${body.proposals.length} proposal(s)${filesNote}`);
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Mining failed");
    } finally {
      mining = false;
    }
  }

  const harnessOptions = [
    { id: "claude", label: "Claude Code" },
    { id: "cursor", label: "Cursor" },
    { id: "copilot", label: "GitHub Copilot" },
    { id: "codex", label: "OpenAI Codex" },
  ] as const;

  function toggleHarness(id: string) {
    if (selectedHarnesses.includes(id)) {
      selectedHarnesses = selectedHarnesses.filter((h) => h !== id);
    } else {
      selectedHarnesses = [...selectedHarnesses, id];
    }
  }

  async function saveHarnesses() {
    if (selectedHarnesses.length === 0) {
      toasts.error("Select at least one harness");
      return;
    }
    savingHarnesses = true;
    try {
      const res = await apiFetch("/api/config", {
        method: "PATCH",
        body: JSON.stringify({ harnesses: selectedHarnesses }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Harnesses saved");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to save harnesses");
    } finally {
      savingHarnesses = false;
    }
  }

  async function createWorkspace() {
    if (!workspaceName.trim()) return;
    creatingWorkspace = true;
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName.trim(), isDefault: data.workspaces.length === 0 }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Workspace created");
      workspaceName = "";
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to create workspace");
    } finally {
      creatingWorkspace = false;
    }
  }
</script>

<svelte:head>
  <title>Settings - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
    <p class="text-[hsl(var(--muted-foreground))]">Workspace, mining, export, and instance configuration.</p>
  </div>

  <div class="card p-6">
    <h3 class="mb-4 text-lg font-semibold">Instance URL</h3>
    <p class="mb-2 text-sm text-[hsl(var(--muted-foreground))]">
      Share this URL with engineers for the dashboard and CLI login.
    </p>
    <code class="block rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-sm break-all">{data.serverUrl}</code>
    <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
      CLI: <code class="font-mono">runcanon login --server {data.serverUrl} --email you@company.com</code>
    </p>
  </div>

  <div class="card p-6">
    <h3 class="mb-4 text-lg font-semibold">Your workspace</h3>
    <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
      Each signed-in user gets a personal workspace. Skills, proposals, and trajectories stay scoped to the active workspace.
      {#if data.isAdmin}
        As admin, you can view and switch between all workspaces on this instance.
      {/if}
    </p>
    {#if data.workspace}
      <div class="rounded-xl bg-[hsl(var(--muted))]/30 p-4">
        <p class="font-semibold">{data.workspace.name}</p>
        <p class="mt-1 font-mono text-xs text-[hsl(var(--muted-foreground))] break-all">{data.workspace.storagePath}</p>
      </div>
    {:else}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">No workspace yet. Sign in again to provision one automatically.</p>
    {/if}

    {#if data.isAdmin}
      <div class="mt-4 flex flex-wrap gap-2">
        <input class="input min-w-[12rem] flex-1 font-mono text-sm" bind:value={workspaceName} placeholder="New org workspace name" />
        <button class="btn btn-secondary" disabled={creatingWorkspace} onclick={createWorkspace}>
          {creatingWorkspace ? "Creating..." : "Create workspace"}
        </button>
      </div>
    {/if}

    {#if data.workspaces.length > 1}
      <ul class="mt-4 space-y-2 text-sm">
        {#each data.workspaces as ws}
          <li class="flex items-center justify-between gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-2">
            <span>{ws.name}{ws.id === data.activeWorkspaceId ? " (active)" : ""}</span>
            {#if ws.id !== data.activeWorkspaceId}
              <button
                class="btn btn-ghost h-8 px-2 text-xs"
                disabled={switchingWorkspace === ws.id}
                onclick={() => switchWorkspace(ws.id)}
              >
                {switchingWorkspace === ws.id ? "Switching..." : "Switch"}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <div class="card p-6">
    <h3 class="mb-4 text-lg font-semibold">LLM for mining</h3>
    {#if data.llmConfigured}
      <p class="text-sm text-[hsl(var(--success))]">
        Active provider: <span class="font-mono">{data.llmProvider}</span> / {data.llmModel}
      </p>
      <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
        Mining uses this provider to generate skill proposals from trajectories.
      </p>
    {:else}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        No LLM provider is enabled yet. An admin must configure one under
        <a href="/admin/providers" class="text-[hsl(var(--primary))]">Providers</a> before mining can use ML generation.
      </p>
    {/if}
  </div>

  {#if data.config}
    <div class="card p-6">
      <h3 class="mb-4 text-lg font-semibold">Harnesses</h3>
      <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
        Choose export targets for skills in this workspace. Matches packages on the
        <a href="/guide" class="text-[hsl(var(--primary))]">Guide</a> page.
      </p>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each harnessOptions as opt}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-xl border border-[hsl(var(--border))] px-4 py-3 has-[:checked]:border-[hsl(var(--primary))]"
          >
            <input
              type="checkbox"
              checked={selectedHarnesses.includes(opt.id)}
              onchange={() => toggleHarness(opt.id)}
            />
            <span class="text-sm font-medium">{opt.label}</span>
            <span class="font-mono text-xs text-[hsl(var(--muted-foreground))]">{opt.id}</span>
          </label>
        {/each}
      </div>
      <button class="btn btn-secondary mt-4 gap-2" disabled={savingHarnesses} onclick={saveHarnesses}>
        <Icon name="check" size={16} />
        {savingHarnesses ? "Saving…" : "Save harnesses"}
      </button>
    </div>

    <div class="card p-6">
      <h3 class="mb-4 text-lg font-semibold">RunCanon config</h3>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div class="rounded-xl bg-[hsl(var(--muted))]/30 p-4">
          <p class="text-sm text-[hsl(var(--muted-foreground))]">Autonomy</p>
          <p class="font-semibold">{data.config.autonomy}</p>
        </div>
        <div class="rounded-xl bg-[hsl(var(--muted))]/30 p-4">
          <p class="text-sm text-[hsl(var(--muted-foreground))]">Mining schedule</p>
          <p class="font-semibold">{data.config.mining.schedule}</p>
        </div>
        <div class="rounded-xl bg-[hsl(var(--muted))]/30 p-4">
          <p class="text-sm text-[hsl(var(--muted-foreground))]">Harnesses</p>
          <p class="font-semibold">{data.config.harnesses.join(", ")}</p>
        </div>
      </div>
      <p class="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
        LLM keys are managed by admins under <a href="/admin/providers" class="text-[hsl(var(--primary))]">Providers</a>.
      </p>
    </div>
  {/if}

  <div class="card p-6">
    <h3 class="mb-4 text-lg font-semibold">Mining</h3>
    <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
      Runs against the active workspace on this instance. Add trajectory JSONL under the workspace `.runcanon/trajectories` path.
    </p>
    <button class="btn btn-primary gap-2" onclick={runMining} disabled={mining}>
      <Icon name="cpu" size={16} />
      {mining ? "Mining..." : "Run mining now"}
    </button>
  </div>

  {#if data.config}
    <div class="card p-6">
      <h3 class="mb-4 text-lg font-semibold">Export</h3>
      <button
        class="btn btn-secondary gap-2"
        disabled={exporting}
        onclick={async () => {
          exporting = true;
          try {
            const res = await apiFetch("/api/export", {
              method: "POST",
              body: JSON.stringify({ harness: "all" }),
            });
            if (!res.ok) throw new Error(await res.text());
            const body = (await res.json()) as { filesWritten: number; skillCount: number };
            toasts.success(`Exported ${body.skillCount} skill(s): ${body.filesWritten} file(s)`);
          } catch (error) {
            toasts.error(error instanceof Error ? error.message : "Export failed");
          } finally {
            exporting = false;
          }
        }}
      >
        <Icon name="package" size={16} />
        {exporting ? "Exporting..." : "Export all harnesses"}
      </button>
    </div>
  {/if}
</div>
