<script lang="ts">
  import ProposalsView from "$lib/components/ProposalsView.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Proposals - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-4">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Proposals</h1>
    <p class="text-[hsl(var(--muted-foreground))]">Review, approve, or reject skill changes.</p>
  </div>

  <ProposalsView proposals={data.proposals} />
</div>
