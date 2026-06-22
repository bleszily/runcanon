<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { invalidateAll } from "$app/navigation";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const harnessOptions = [
    { id: "claude", label: "Claude Code", package: "@runcanon/harness-claude" },
    { id: "cursor", label: "Cursor", package: "@runcanon/harness-cursor" },
    { id: "copilot", label: "GitHub Copilot", package: "@runcanon/harness-copilot" },
    { id: "codex", label: "OpenAI Codex", package: "@runcanon/harness-openai" },
  ] as const;

  let selectedHarnesses = $state<string[]>([...data.harnesses]);
  let savingHarnesses = $state(false);

  const loginCmd = $derived(
    data.userEmail
      ? `runcanon login --server ${data.serverUrl} --email ${data.userEmail}`
      : `runcanon login --server ${data.serverUrl} --email you@company.com`
  );

  const mineCmd = "runcanon init && runcanon mine --source .runcanon/trajectories";
  const exportCmd = "runcanon export -h all";

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
      toasts.success("Harnesses saved to your workspace");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to save harnesses");
    } finally {
      savingHarnesses = false;
    }
  }
</script>

<svelte:head>
  <title>Getting started - RunCanon</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Getting started</h1>
    <p class="mt-2 text-[hsl(var(--muted-foreground))]">
      Connect the CLI to this instance, configure harnesses for your workspace, and run mining.
    </p>
  </div>

  <div class="card p-6">
    <h2 class="mb-3 text-lg font-semibold">This instance</h2>
    <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
      Use this URL for the dashboard and CLI (local Docker):
    </p>
    <code class="block rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-sm">{data.serverUrl}</code>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">1. Install CLI (verified)</h2>
    <p class="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
      Install a SHA256-verified build hosted on this server. Requires Node.js 20+ on your machine.
    </p>
    <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">macOS / Linux</p>
    <pre class="overflow-x-auto rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-xs">curl -fsSL {data.serverUrl}/api/releases/install.sh | bash</pre>
    <p class="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Windows (PowerShell)</p>
    <pre class="overflow-x-auto rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-xs">irm {data.serverUrl}/api/releases/install.ps1 | iex</pre>
    {#if data.release}
      <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
        Latest CLI: v{data.release.version} · SHA256 verified against
        <a href="{data.serverUrl}{data.release.checksumsFile}" class="text-[hsl(var(--primary))]">checksums</a>
      </p>
    {/if}
    <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
      Manual manifest: <code class="font-mono">{data.serverUrl}/api/releases/latest</code>
    </p>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">2. CLI login</h2>
    <p class="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
      Authenticate once. Mining, proposals, and exports sync to your personal workspace in the dashboard.
    </p>
    <pre class="overflow-x-auto rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-xs">{loginCmd}</pre>
    <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
      Use <code class="font-mono">runcanon login --server {data.serverUrl} --browser</code> if you are already signed in to the dashboard.
      Verify with <code class="font-mono">runcanon whoami</code>
    </p>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">3. Configure harnesses</h2>
    <p class="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
      Choose export targets for your workspace. These match the package harnesses below and apply to dashboard export and CLI.
    </p>
    <div class="grid gap-3 sm:grid-cols-2">
      {#each harnessOptions as opt}
        <label
          class="flex cursor-pointer items-start gap-3 rounded-xl border border-[hsl(var(--border))] p-4 transition-colors has-[:checked]:border-[hsl(var(--primary))] has-[:checked]:bg-[hsl(var(--primary))]/5"
        >
          <input
            type="checkbox"
            class="mt-1"
            checked={selectedHarnesses.includes(opt.id)}
            onchange={() => toggleHarness(opt.id)}
          />
          <div>
            <p class="font-mono text-sm text-[hsl(var(--primary))]">{opt.package}</p>
            <p class="text-sm font-medium">{opt.label}</p>
          </div>
        </label>
      {/each}
    </div>
    <button class="btn btn-primary mt-4 gap-2" disabled={savingHarnesses} onclick={saveHarnesses}>
      <Icon name="check" size={16} />
      {savingHarnesses ? "Saving…" : "Save harnesses"}
    </button>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">4. Mine from your project</h2>
    <p class="mb-3 text-sm text-[hsl(var(--muted-foreground))]">
      In your repo, collect trajectories under <code class="font-mono">.runcanon/trajectories</code>, then run mining.
      Results appear under <strong>Proposals</strong> in this dashboard.
    </p>
    <pre class="overflow-x-auto rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-xs">{mineCmd}</pre>
    <p class="mt-3 text-sm text-[hsl(var(--muted-foreground))]">
      Or use <strong>Settings → Run mining now</strong> after adding trajectory JSONL to your workspace.
    </p>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">5. Review & export</h2>
    <ol class="list-decimal space-y-2 pl-5 text-sm">
      <li>Approve proposals under <a href="/proposals" class="text-[hsl(var(--primary))] hover:underline">Proposals</a>.</li>
      <li>Export from <a href="/settings" class="text-[hsl(var(--primary))] hover:underline">Settings</a> or run:</li>
    </ol>
    <pre class="mt-3 overflow-x-auto rounded-xl bg-[hsl(var(--muted))]/50 p-4 font-mono text-xs">{exportCmd}</pre>
    <p class="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
      LLM keys are configured by an admin under Providers (admin only).
    </p>
  </div>

  <div class="card p-6">
    <h2 class="mb-4 text-lg font-semibold">Packages</h2>
    <div class="grid gap-4 md:grid-cols-2">
      {#each data.packages as pkg}
        <div class="rounded-xl border border-[hsl(var(--border))] p-4">
          <p class="font-mono text-sm text-[hsl(var(--primary))]">{pkg.package}</p>
          <p class="mt-2 text-sm font-medium">{pkg.summary}</p>
          <p class="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{pkg.setup}</p>
        </div>
      {/each}
    </div>
  </div>
</div>
