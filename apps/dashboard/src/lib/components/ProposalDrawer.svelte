<script lang="ts">
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import DiffBlock from "./DiffBlock.svelte";
  import { focusTrap } from "$lib/actions/focusTrap";
  import { invalidateAll } from "$app/navigation";
  import { toasts } from "$lib/stores/toasts";
  import type { Proposal } from "$lib/types";

  interface Props {
    proposal: Proposal | null;
    onClose: () => void;
  }

  let { proposal, onClose }: Props = $props();
  let loading = $state(false);

  async function approveProposalAction() {
    if (!proposal) return;
    loading = true;
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/approve`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`Approved "${proposal.skillName}"`);
      onClose();
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to approve proposal");
    } finally {
      loading = false;
    }
  }

  async function rejectProposalAction() {
    if (!proposal) return;
    loading = true;
    try {
      const res = await fetch(`/api/proposals/${proposal.id}/reject`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`Rejected "${proposal.skillName}"`);
      onClose();
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to reject proposal");
    } finally {
      loading = false;
    }
  }

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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
</script>

{#if proposal}
  <div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="proposal-drawer-title" tabindex="-1" use:focusTrap={onClose}>
    <div class="absolute inset-0 bg-black/40 transition-opacity" onclick={onClose} aria-hidden="true"></div>
    <div
      class="relative z-10 flex h-full w-full max-w-2xl translate-x-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl transition-transform duration-300"
    >
      <div class="flex items-center justify-between border-b border-[hsl(var(--border))] p-5">
        <div>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">Proposal #{proposal.id}</p>
          <h2 id="proposal-drawer-title" class="text-lg font-semibold">{proposal.skillName}</h2>
        </div>
        <button class="btn btn-ghost h-8 w-8 p-0" onclick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <div class="mb-5 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(proposal.status)}>{proposal.status}</Badge>
          <Badge variant="info">{proposal.type}</Badge>
          <span class="text-xs text-[hsl(var(--muted-foreground))]">Sample size: {proposal.sampleSize}</span>
        </div>

        <div class="mb-5 rounded-xl border border-[hsl(var(--border))] p-4">
          <p class="text-sm font-medium">Confidence</p>
          <div class="mt-2 flex items-center gap-3">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <div
                class="h-full rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))]"
                style="width: {proposal.confidence * 100}%"
              ></div>
            </div>
            <span class="text-lg font-bold">{Math.round(proposal.confidence * 100)}%</span>
          </div>
          <p class="mt-3 text-sm text-[hsl(var(--muted-foreground))]">{proposal.reason}</p>
        </div>

        <div class="mb-5">
          <DiffBlock before={proposal.oldMarkdown} after={proposal.newMarkdown} />
        </div>

        <div class="card p-4">
          <h4 class="mb-3 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Audit Log
          </h4>
          <div class="space-y-3">
            {#each proposal.auditLog as entry}
              <div class="flex items-start gap-3">
                <div class="mt-1 h-2 w-2 rounded-full bg-[hsl(var(--primary))]"></div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <span class="text-sm font-medium">{entry.action}</span>
                    <span class="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(entry.timestamp)}</span>
                  </div>
                  <p class="text-xs text-[hsl(var(--muted-foreground))]">{entry.actor}{#if entry.note}: {entry.note}{/if}</p>
                </div>
              </div>
            {:else}
              <p class="text-sm text-[hsl(var(--muted-foreground))]">No audit entries.</p>
            {/each}
          </div>
        </div>
      </div>

      {#if proposal.status === "pending"}
        <div class="flex items-center gap-3 border-t border-[hsl(var(--border))] p-5">
          <button class="btn btn-primary flex-1 gap-2" onclick={approveProposalAction} disabled={loading}>
            <Icon name="check" size={16} />
            Approve
          </button>
          <button class="btn btn-secondary flex-1 text-[hsl(var(--destructive))]" onclick={rejectProposalAction} disabled={loading}>
            <Icon name="x" size={16} />
            Reject
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
