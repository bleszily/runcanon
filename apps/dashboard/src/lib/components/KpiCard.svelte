<script lang="ts">
  import Icon from "./Icon.svelte";
  import Sparkline from "./Sparkline.svelte";
  import type { IconName } from "$lib/icons";

  interface Props {
    title: string;
    value: string | number;
    icon: IconName;
    trend?: { direction: "up" | "down" | "flat"; value: string };
    sparkline?: number[];
    gradient?: string;
    loading?: boolean;
  }

  let {
    title,
    value,
    icon,
    trend,
    sparkline,
    gradient = "from-[hsl(var(--primary))] to-[hsl(var(--accent))]",
    loading = false,
  }: Props = $props();
</script>

<div class="card card-hover relative overflow-hidden p-6">
  <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br {gradient} opacity-10 blur-2xl"></div>

  {#if loading}
    <div class="space-y-3">
      <div class="skeleton h-4 w-24"></div>
      <div class="skeleton h-10 w-16"></div>
    </div>
  {:else}
    <div class="relative flex items-start justify-between">
      <div>
        <p class="text-sm font-medium text-[hsl(var(--muted-foreground))]">{title}</p>
        <div class="mt-2 flex items-baseline gap-3">
          <h3 class="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">{value}</h3>
          {#if trend}
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {trend.direction ===
              'up'
                ? 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]'
                : trend.direction === 'down'
                  ? 'bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}"
            >
              {trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"}
              {trend.value}
            </span>
          {/if}
        </div>
      </div>
      <div
        class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br {gradient} text-white shadow-md"
      >
        <Icon name={icon} size={22} />
      </div>
    </div>

    {#if sparkline && sparkline.length > 0}
      <div class="relative mt-4 h-10 w-full">
        <Sparkline data={sparkline} width={200} height={40} />
      </div>
    {/if}
  {/if}
</div>
