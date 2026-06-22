<script lang="ts">
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import ProposalDrawer from "./ProposalDrawer.svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { toasts } from "$lib/stores/toasts";
  import type { Proposal } from "$lib/types";

  interface Props {
    proposals: Proposal[];
    loading?: boolean;
  }

  let { proposals, loading = false }: Props = $props();

  let view = $state<"board" | "list">("board");
  let selectedProposal = $state<Proposal | null>(null);
  let mining = $state(false);

  $effect(() => {
    const proposalId = $page.url.searchParams.get("proposal");
    if (!proposalId) return;
    const match = proposals.find((p) => p.id === proposalId);
    if (match) selectedProposal = match;
  });

  const columns: { status: Proposal["status"]; label: string; variant: import("./Badge.svelte").Props["variant"] }[] = [
    { status: "pending", label: "Pending", variant: "warning" },
    { status: "approved", label: "Approved", variant: "success" },
    { status: "rejected", label: "Rejected", variant: "danger" },
    { status: "applied", label: "Applied", variant: "success" },
  ];

  const typeIcon = (type: Proposal["type"]) => {
    switch (type) {
      case "create":
        return "plus";
      case "update":
        return "check";
      case "merge":
        return "code";
      case "retire":
        return "x";
      default:
        return "proposals";
    }
  };

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

  function proposalsByStatus(status: Proposal["status"]) {
    return proposals.filter((p) => p.status === status);
  }

  async function runMining() {
    mining = true;
    toasts.info("Mining started — LLM analysis usually takes 2–5 minutes. Keep this tab open.");
    try {
      const res = await fetch("/api/mine", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { proposals: unknown[] };
      toasts.success(`Mining complete - ${body.proposals.length} proposal(s) created`);
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Mining failed");
    } finally {
      mining = false;
    }
  }
</script>

<div class="space-y-4">
  <div class="flex items-center justify-between gap-3">
    <div class="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] p-1">
      <button
        class="btn h-8 px-3 text-xs {view === 'board' ? 'btn-secondary' : 'btn-ghost'}"
        onclick={() => (view = "board")}
      >
        Board
      </button>
      <button
        class="btn h-8 px-3 text-xs {view === 'list' ? 'btn-secondary' : 'btn-ghost'}"
        onclick={() => (view = "list")}
      >
        List
      </button>
    </div>
    <button class="btn btn-primary gap-2 text-xs" onclick={runMining} disabled={mining}>
      <Icon name={mining ? "cpu" : "plus"} size={14} />
      {mining ? "Mining…" : "Run mining"}
    </button>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {#each Array(4) as _, i}
        <div class="card h-96 p-4">
          <div class="skeleton mb-4 h-6 w-24"></div>
          <div class="space-y-3">
            <div class="skeleton h-24 w-full"></div>
            <div class="skeleton h-24 w-full"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if view === "board"}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {#each columns as column}
        <div class="card flex flex-col bg-[hsl(var(--muted))]/20">
          <div class="flex items-center justify-between border-b border-[hsl(var(--border))] p-4">
            <h4 class="font-semibold">{column.label}</h4>
            <span
              class="flex h-6 min-w-6 items-center justify-center rounded-full bg-[hsl(var(--muted))] px-2 text-xs font-medium"
              >{proposalsByStatus(column.status).length}</span
            >
          </div>
          <div class="flex-1 space-y-3 p-3">
            {#each proposalsByStatus(column.status) as proposal}
              <button
                class="card card-hover w-full p-4 text-left"
                onclick={() => (selectedProposal = proposal)}
              >
                <div class="mb-2 flex items-center justify-between">
                  <Badge variant={statusVariant(proposal.status)} class="text-[10px]">{proposal.type}</Badge>
                  <Icon name={typeIcon(proposal.type)} size={14} class="text-[hsl(var(--muted-foreground))]" />
                </div>
                <p class="mb-1 line-clamp-2 break-words font-medium leading-snug">{proposal.skillName}</p>
                <p class="mb-3 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{proposal.reason}</p>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-[hsl(var(--muted-foreground))]">{proposal.sampleSize} samples</span>
                  <span class="font-semibold text-[hsl(var(--primary))]">{Math.round(proposal.confidence * 100)}%</span>
                </div>
              </button>
            {:else}
              <div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))] py-8 text-center">
                <Icon name="proposals" size={24} class="mb-2 text-[hsl(var(--muted-foreground))] opacity-40" />
                <p class="text-xs text-[hsl(var(--muted-foreground))]">No {column.label.toLowerCase()} proposals.</p>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-left">
          <tr>
            <th class="px-5 py-3 font-medium">Skill</th>
            <th class="px-5 py-3 font-medium">Type</th>
            <th class="px-5 py-3 font-medium">Status</th>
            <th class="px-5 py-3 font-medium">Confidence</th>
            <th class="px-5 py-3 font-medium">Samples</th>
            <th class="px-5 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[hsl(var(--border))]">
          {#each proposals as proposal}
            <tr class="hover:bg-[hsl(var(--muted))]/30">
              <td class="px-5 py-3">
                <div class="line-clamp-2 max-w-xs break-words font-medium">{proposal.skillName}</div>
                <div class="text-xs text-[hsl(var(--muted-foreground))]">{proposal.reason}</div>
              </td>
              <td class="px-5 py-3">
                <Badge variant="info">{proposal.type}</Badge>
              </td>
              <td class="px-5 py-3">
                <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
              </td>
              <td class="px-5 py-3">{Math.round(proposal.confidence * 100)}%</td>
              <td class="px-5 py-3">{proposal.sampleSize}</td>
              <td class="px-5 py-3 text-right">
                <button class="btn btn-ghost h-7 px-2 text-xs" onclick={() => (selectedProposal = proposal)}
                  >Review</button
                >
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="6" class="px-5 py-10 text-center text-[hsl(var(--muted-foreground))]">
                No proposals yet. Run mining from Settings or use the button above.
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<ProposalDrawer proposal={selectedProposal} onClose={() => (selectedProposal = null)} />
