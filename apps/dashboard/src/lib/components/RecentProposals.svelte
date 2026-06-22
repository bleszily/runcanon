<script lang="ts">
  import { goto } from "$app/navigation";
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import type { Proposal } from "$lib/types";

  interface Props {
    proposals: Proposal[];
    loading?: boolean;
    onSelect?: (proposal: Proposal) => void;
  }

  let { proposals, loading = false, onSelect }: Props = $props();

  const recent = $derived(proposals.slice(0, 5));

  const statusVariant = (status: Proposal["status"]) => {
    switch (status) {
      case "approved":
      case "applied":
        return "success";
      case "pending":
        return "warning";
      case "rejected":
        return "danger";
      default:
        return "default";
    }
  };

  const typeLabel = (type: Proposal["type"]) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  function reviewProposal(proposal: Proposal) {
    if (onSelect) {
      onSelect(proposal);
      return;
    }
    void goto(`/proposals?proposal=${encodeURIComponent(proposal.id)}`);
  }
</script>

<div class="card p-6">
  <div class="mb-4 flex items-center justify-between">
    <h3 class="text-lg font-semibold">Recent Proposals</h3>
    <a href="/proposals" class="btn btn-ghost h-8 px-2 text-xs">View all</a>
  </div>

  {#if loading}
    <div class="space-y-3">
      {#each Array(4) as _, i}
        <div class="skeleton h-14 w-full"></div>
      {/each}
    </div>
  {:else if recent.length === 0}
    <div class="flex flex-col items-center justify-center py-10 text-[hsl(var(--muted-foreground))]">
      <Icon name="proposals" size={32} class="mb-2 opacity-50" />
      <p class="text-sm">No proposals yet.</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="border-b border-[hsl(var(--border))] text-left text-[hsl(var(--muted-foreground))]">
          <tr>
            <th class="pb-2 font-medium">Skill</th>
            <th class="pb-2 font-medium">Type</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Confidence</th>
            <th class="pb-2 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[hsl(var(--border))]">
          {#each recent as proposal}
            <tr class="hover:bg-[hsl(var(--muted))]/50">
              <td class="py-3 font-medium">{proposal.skillName}</td>
              <td class="py-3">
                <Badge variant="info">{typeLabel(proposal.type)}</Badge>
              </td>
              <td class="py-3">
                <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
              </td>
              <td class="py-3">
                <div class="flex items-center gap-2">
                  <div class="h-1.5 w-16 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                    <div
                      class="h-full rounded-full bg-[hsl(var(--primary))]"
                      style="width: {proposal.confidence * 100}%"
                    ></div>
                  </div>
                  <span class="text-xs tabular-nums">{Math.round(proposal.confidence * 100)}%</span>
                </div>
              </td>
              <td class="py-3 text-right">
                <button
                  type="button"
                  class="btn btn-ghost h-7 px-2 text-xs"
                  onclick={() => reviewProposal(proposal)}
                >
                  Review
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
