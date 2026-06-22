<script lang="ts">
  import AutonomyView from "$lib/components/AutonomyView.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Autonomy - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-4">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Autonomy</h1>
    <p class="text-[hsl(var(--muted-foreground))]">Set autonomy boundaries and emergency controls.</p>
  </div>

  <AutonomyView settings={data.autonomy} />
</div>
