<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let acting = $state<string | null>(null);
  let certExpiresAt = $state("");
  let reviewDueAt = $state("");
  let rejectReason = $state<Record<string, string>>({});

  async function approve(promotionId: string) {
    acting = promotionId;
    try {
      const res = await apiFetch("/api/org/promotions", {
        method: "POST",
        body: JSON.stringify({
          action: "approve",
          promotionId,
          certExpiresAt: certExpiresAt || undefined,
          reviewDueAt: reviewDueAt || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Skill published to org library");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Approve failed");
    } finally {
      acting = null;
    }
  }

  async function reject(promotionId: string) {
    acting = promotionId;
    try {
      const res = await apiFetch("/api/org/promotions", {
        method: "POST",
        body: JSON.stringify({
          action: "reject",
          promotionId,
          reason: rejectReason[promotionId],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Promotion rejected");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Reject failed");
    } finally {
      acting = null;
    }
  }
</script>

<svelte:head>
  <title>Promotion queue - RunCanon Admin</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Promotion queue</h1>
    <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
      Review skills submitted from workspace mining, Git import, or engineer promotion requests before publishing to the org library.
    </p>
  </div>

  <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4">
    <h2 class="text-lg font-semibold">Default certification dates (optional)</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Cert expires at</span>
        <input type="datetime-local" class="w-full rounded-lg border px-3 py-2" bind:value={certExpiresAt} />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Review due at</span>
        <input type="datetime-local" class="w-full rounded-lg border px-3 py-2" bind:value={reviewDueAt} />
      </label>
    </div>
  </section>

  <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="mb-4 text-lg font-semibold">Pending ({data.promotions.length})</h2>
    {#if data.promotions.length === 0}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">No skills awaiting curator review.</p>
    {:else}
      <ul class="divide-y divide-[hsl(var(--border))]">
        {#each data.promotions as promo}
          <li class="py-4 space-y-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="font-medium">{promo.name} <span class="text-[hsl(var(--muted-foreground))]">({promo.skillId})</span></p>
                <p class="text-xs text-[hsl(var(--muted-foreground))]">
                  Source: {promo.source} · Submitted by {promo.submittedBy} · {new Date(promo.submittedAt).toLocaleString()}
                  {#if promo.assessmentScore != null}
                    · Score {(promo.assessmentScore * 100).toFixed(0)}%
                  {/if}
                </p>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-xs text-[hsl(var(--primary-foreground))]"
                  disabled={acting === promo.id}
                  onclick={() => approve(promo.id)}
                >
                  Approve & publish
                </button>
                <button
                  type="button"
                  class="rounded-lg border px-3 py-1.5 text-xs text-red-600"
                  disabled={acting === promo.id}
                  onclick={() => reject(promo.id)}
                >
                  Reject
                </button>
              </div>
            </div>
            <textarea
              class="w-full rounded-lg border px-3 py-2 text-xs font-mono"
              rows="6"
              readonly
              value={promo.markdown.slice(0, 2000) + (promo.markdown.length > 2000 ? "\n…" : "")}
            ></textarea>
            <input
              type="text"
              placeholder="Rejection reason (optional)"
              class="w-full rounded-lg border px-3 py-2 text-sm"
              bind:value={rejectReason[promo.id]}
            />
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
