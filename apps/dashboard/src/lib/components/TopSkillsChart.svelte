<script lang="ts">
  import type { Skill } from "$lib/types";

  interface Props {
    skills: Skill[];
    loading?: boolean;
  }

  let { skills, loading = false }: Props = $props();

  const topSkills = $derived(
    [...skills]
      .filter((s) => s.status !== "retired")
      .sort((a, b) => b.usage.calls30d - a.usage.calls30d)
      .slice(0, 5)
  );

  const max = $derived(Math.max(1, ...topSkills.map((s) => s.usage.calls30d)));
</script>

<div class="card p-6">
  <h3 class="mb-4 text-lg font-semibold">Top Skills by Usage</h3>

  {#if loading}
    <div class="space-y-4">
      {#each Array(5) as _, i}
        <div class="skeleton h-8 w-full"></div>
      {/each}
    </div>
  {:else if topSkills.length === 0}
    <p class="py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No usage data yet.</p>
  {:else}
    <div class="space-y-4">
      {#each topSkills as skill}
        <div class="group">
          <div class="mb-1 flex items-center justify-between text-sm">
            <span class="font-medium">{skill.name}</span>
            <span class="text-[hsl(var(--muted-foreground))]">{skill.usage.calls30d.toLocaleString()} calls</span>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              class="h-full rounded-full bg-gradient-to-r from-[hsl(var(--primary))] to-[hsl(var(--accent))] transition-all duration-500"
              style="width: {(skill.usage.calls30d / max) * 100}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
