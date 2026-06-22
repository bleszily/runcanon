<script lang="ts">
  import SkillsView from "$lib/components/SkillsView.svelte";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();
</script>

<svelte:head>
  <title>Skills - RunCanon Dashboard</title>
</svelte:head>

<div class="space-y-4">
  <div>
    <h1 class="text-3xl font-bold tracking-tight">Skills</h1>
    <p class="text-[hsl(var(--muted-foreground))]">
      Browse workspace and org library skills you are entitled to use.
    </p>
  </div>

  <SkillsView skills={data.skills} />
</div>
