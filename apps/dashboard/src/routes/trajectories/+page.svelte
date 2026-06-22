<script lang="ts">
  import TrajectoriesView from "$lib/components/TrajectoriesView.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Trajectories - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-4">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Trajectories</h1>
    <p class="text-[hsl(var(--muted-foreground))]">
      Live agent sessions from JSONL (MCP telemetry or CLI upload). Catalog SKILL.md imports are excluded — only real tool-call sequences appear here.
    </p>
  </div>

  <TrajectoriesView
    trajectories={data.trajectories}
    workflowGraph={data.workflowGraph}
    allTrajectories={data.allTrajectories}
  />
</div>
