<script lang="ts">
  interface Props {
    value: number;
    loading?: boolean;
  }

  let { value, loading = false }: Props = $props();

  const clamped = $derived(Math.min(1, Math.max(0, value)));
  const percentage = $derived(Math.round(clamped * 100));
  const radius = 52;
  const circumference = $derived(2 * Math.PI * radius);
  const dashoffset = $derived(circumference * (1 - clamped));

  const color = $derived.by(() => {
    if (percentage >= 80) return "hsl(var(--success))";
    if (percentage >= 60) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  });
</script>

<div class="card p-6">
  <h3 class="mb-2 text-lg font-semibold">Goal Alignment</h3>

  {#if loading}
    <div class="flex aspect-square items-center justify-center">
      <div class="skeleton h-32 w-32 rounded-full"></div>
    </div>
  {:else}
    <div class="flex flex-col items-center py-4">
      <div class="relative h-36 w-36">
        <svg class="h-full w-full -rotate-90" viewBox="0 0 120 120">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="hsl(var(--muted))"
            stroke-width="10"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            stroke-width="10"
            stroke-linecap="round"
            stroke-dasharray={circumference}
            stroke-dashoffset={dashoffset}
            class="transition-all duration-700"
          />
        </svg>
        <div class="absolute inset-0 flex flex-col items-center justify-center">
          <span class="text-3xl font-bold" style="color: {color}">{percentage}%</span>
          <span class="text-xs text-[hsl(var(--muted-foreground))]">{percentage}% aligned</span>
        </div>
      </div>

      <p class="mt-4 max-w-xs text-center text-sm text-[hsl(var(--muted-foreground))]">
        Percentage of recent trajectories that satisfied stated goals without human correction.
      </p>
    </div>
  {/if}
</div>
