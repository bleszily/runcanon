<script lang="ts">
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
  let bundling = $state(false);

  async function createBundle() {
    bundling = true;
    try {
      const res = await apiFetch("/api/org/bundles", {
        method: "POST",
        body: JSON.stringify({ orgOnly: false }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { bundleId: string; skillCount: number };
      toasts.success(`Signed bundle created (${body.skillCount} skills): ${body.bundleId}`);
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Bundle failed");
    } finally {
      bundling = false;
    }
  }

  const m = $derived(data.metrics);
</script>

<svelte:head>
  <title>Org metrics - RunCanon Admin</title>
</svelte:head>

<div class="space-y-8">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Org metrics</h1>
      <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Adoption, sync/export activity, and audit trail for the enterprise skill library.
      </p>
    </div>
    <button
      type="button"
      class="rounded-lg border px-4 py-2 text-sm"
      disabled={bundling}
      onclick={createBundle}
    >
      {bundling ? "Creating…" : "Export signed bundle"}
    </button>
  </div>

  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Published skills</p>
      <p class="text-2xl font-bold">{m.totalPublishedSkills}</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Assignments</p>
      <p class="text-2xl font-bold">{m.totalAssignments}</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Syncs</p>
      <p class="text-2xl font-bold">{m.totalSyncs}</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Exports</p>
      <p class="text-2xl font-bold">{m.totalExports}</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Adoption rate</p>
      <p class="text-2xl font-bold">{(m.adoptionRate * 100).toFixed(1)}%</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Trajectories processed</p>
      <p class="text-2xl font-bold">{m.trajectorySessionsProcessed}</p>
    </div>
    <div class="rounded-2xl border p-4">
      <p class="text-xs text-[hsl(var(--muted-foreground))]">Skills from mining</p>
      <p class="text-2xl font-bold">{m.skillsCreatedFromMining}</p>
    </div>
  </div>

  <section class="rounded-2xl border p-6">
    <h2 class="mb-4 text-lg font-semibold">Recent audit</h2>
    <ul class="divide-y text-sm">
      {#each data.audit as entry}
        <li class="flex flex-wrap justify-between gap-2 py-2">
          <span><strong>{entry.action}</strong> · {entry.resourceType}{entry.resourceId ? ` · ${entry.resourceId}` : ""}</span>
          <span class="text-[hsl(var(--muted-foreground))]">{entry.actor} · {new Date(entry.timestamp).toLocaleString()}</span>
        </li>
      {/each}
    </ul>
  </section>
</div>
