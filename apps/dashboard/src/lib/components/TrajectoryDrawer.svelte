<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { Trajectory, TrajectoryEvent } from "$lib/types";

  interface Props {
    trajectory: Trajectory | null;
    onClose: () => void;
  }

  let { trajectory, onClose }: Props = $props();

  const eventIcons: Record<TrajectoryEvent["type"], string> = {
    plan: "cpu",
    api: "globe",
    cli: "terminal",
    browser: "search",
    memory: "database",
    code: "code",
    verify: "shield",
    default: "clock",
  };

  const eventIcon = (type: TrajectoryEvent["type"]) => eventIcons[type] ?? eventIcons.default;

  function formatDuration(ms: number | null) {
    if (ms == null) return "—";
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}m ${rem}s`;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
</script>

{#if trajectory}
  <div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="traj-drawer-title">
    <div class="absolute inset-0 bg-black/40" onclick={onClose} aria-hidden="true"></div>
    <div
      class="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-[hsl(var(--border))] p-5">
        <div>
          <p class="text-xs text-[hsl(var(--muted-foreground))]">{trajectory.project}</p>
          <h2 id="traj-drawer-title" class="text-lg font-semibold">{trajectory.intent}</h2>
        </div>
        <button class="btn btn-ghost h-8 w-8 p-0" onclick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <div class="mb-6 grid grid-cols-2 gap-3">
          <div class="card p-3">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Outcome</p>
            <p
              class="text-lg font-bold capitalize {trajectory.outcome === 'success'
                ? 'text-[hsl(var(--success))]'
                : trajectory.outcome === 'failure'
                  ? 'text-[hsl(var(--destructive))]'
                  : 'text-[hsl(var(--warning))]'}"
            >
              {trajectory.outcome}
            </p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Duration</p>
            <p class="text-lg font-bold">{formatDuration(trajectory.durationMs)}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Episodes</p>
            <p class="text-lg font-bold">{trajectory.episodeCount}</p>
          </div>
          <div class="card p-3">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Started</p>
            <p class="text-sm font-medium">{formatDate(trajectory.startedAt)}</p>
          </div>
        </div>

        <div class="card p-4">
          <h4 class="mb-4 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Event Timeline
          </h4>
          <div class="relative pl-6">
            <div class="absolute left-2.5 top-2 bottom-2 w-px bg-[hsl(var(--border))]"></div>
            <div class="space-y-6">
              {#each trajectory.events as event, i}
                <div class="relative">
                  <div
                    class="absolute -left-6 top-0 flex h-5 w-5 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--primary))]"
                  >
                    <Icon name={eventIcon(event.type)} size={12} />
                  </div>
                  <div class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-3">
                    <div class="flex items-center justify-between">
                      <span class="text-sm font-semibold capitalize">Step {event.step}: {event.type}</span>
                      <span class="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(event.timestamp)}</span>
                    </div>
                    <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{event.description}</p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
