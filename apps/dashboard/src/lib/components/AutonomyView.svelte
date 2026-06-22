<script lang="ts">
  import Icon from "./Icon.svelte";
  import { invalidateAll } from "$app/navigation";
  import { autonomousLadderCount, formatAutonomyRiskSummary } from "$lib/autonomy-summary.js";
  import { toasts } from "$lib/stores/toasts";
  import type { AutonomySettings, AutonomyLevel } from "$lib/types";

  interface Props {
    settings: AutonomySettings;
    loading?: boolean;
  }

  let { settings, loading = false }: Props = $props();

  let globalEnabled = $state(settings.globalEnabled);
  let emergencyStop = $state(settings.emergencyStop);
  let undoWindow = $state(settings.undoWindowMinutes);
  let ladders = $state(settings.ladders.map((l) => ({ ...l })));

  $effect(() => {
    globalEnabled = settings.globalEnabled;
    emergencyStop = settings.emergencyStop;
    undoWindow = settings.undoWindowMinutes;
    ladders = settings.ladders.map((l) => ({ ...l }));
  });

  const levels: AutonomyLevel[] = ["show", "ask", "do-show", "do-tell"];

  const levelMeta: Record<
    AutonomyLevel,
    { label: string; description: string; color: string }
  > = {
    show: {
      label: "Show me",
      description: "Only surface information; take no action.",
      color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    },
    ask: {
      label: "Ask me",
      description: "Prepare action but require explicit approval.",
      color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
    },
    "do-show": {
      label: "Do it and show me",
      description: "Execute immediately and present the result.",
      color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
    },
    "do-tell": {
      label: "Do it and tell me later",
      description: "Execute and summarize in periodic digest.",
      color: "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]",
    },
  };

  const autonomousCount = $derived(autonomousLadderCount(ladders, globalEnabled, emergencyStop));

  const riskSummary = $derived.by(() =>
    formatAutonomyRiskSummary({
      globalEnabled,
      emergencyStop,
      autonomousCount,
      ladderCount: ladders.length,
      undoWindowMinutes: undoWindow,
    })
  );

  let saving = $state(false);

  async function saveSettings() {
    saving = true;
    try {
      const res = await fetch("/api/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          globalEnabled,
          emergencyStop,
          undoWindowMinutes: undoWindow,
          ladders,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Autonomy settings saved");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      saving = false;
    }
  }
</script>

<div class="space-y-6">
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
    <div class="card p-5 lg:col-span-2">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold">Global Autonomy</h3>
          <p class="text-sm text-[hsl(var(--muted-foreground))]">
            Allow RunCanon to act on approved proposals automatically.
          </p>
        </div>
        <label class="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            class="peer sr-only"
            bind:checked={globalEnabled}
            aria-label="Toggle global autonomy"
          />
          <span
            class="inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent p-0.5 transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[hsl(var(--ring))] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[hsl(var(--background))] {globalEnabled
              ? 'bg-[hsl(var(--success))]'
              : 'bg-[hsl(var(--muted))]'}"
          >
            <span
              class="pointer-events-none block h-6 w-6 rounded-full bg-white shadow-sm transition-transform {globalEnabled
                ? 'translate-x-5'
                : 'translate-x-0'}"
            ></span>
          </span>
        </label>
      </div>

      <div class="mt-5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-4">
        <div class="flex items-start gap-3">
          <Icon
            name="shield"
            size={20}
            class="mt-0.5 text-[hsl(var(--muted-foreground))]"
          />
          <div>
            <p class="text-sm font-medium">Risk summary</p>
            <p class="text-sm text-[hsl(var(--muted-foreground))]">{riskSummary}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="card p-5">
      <h3 class="mb-3 text-lg font-semibold">Emergency Controls</h3>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium">Emergency stop</span>
          <button
            class="btn {emergencyStop
              ? 'btn-primary bg-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/90'
              : 'btn-secondary'} h-8 px-3 text-xs"
            onclick={() => (emergencyStop = !emergencyStop)}
          >
            {emergencyStop ? "STOPPED" : "Stop all"}
          </button>
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium" for="undo-window"
            >Undo window (minutes)</label
          >
          <input
            id="undo-window"
            type="number"
            min="0"
            max="120"
            bind:value={undoWindow}
            class="input"
          />
        </div>
      </div>
    </div>
  </div>

  <div class="card overflow-hidden">
    <div class="border-b border-[hsl(var(--border))] p-5">
      <h3 class="text-lg font-semibold">Autonomy Ladder</h3>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        Configure what level of independence each task type has.
      </p>
    </div>

    {#if loading}
      <div class="space-y-3 p-5">
        {#each Array(4) as _, i}
          <div class="skeleton h-16 w-full"></div>
        {/each}
      </div>
    {:else}
      <div class="divide-y divide-[hsl(var(--border))]">
        {#each ladders as ladder, i}
          <div class="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div class="flex-1">
              <p class="font-medium">{ladder.taskType}</p>
              <p class="text-sm text-[hsl(var(--muted-foreground))]">
                {ladder.description}
              </p>
            </div>
            <div class="flex items-center gap-2">
              {#each levels as level}
                {@const active = ladder.level === level}
                <button
                  class="rounded-lg px-3 py-2 text-xs font-semibold transition-colors {active
                    ? levelMeta[level].color + ' ring-1 ring-current'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
                  onclick={() => (ladders[i].level = level)}
                  title={levelMeta[level].description}
                >
                  {levelMeta[level].label}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="flex justify-end">
    <button class="btn btn-primary gap-2" onclick={saveSettings} disabled={saving || loading}>
      <Icon name="check" size={16} />
      {saving ? "Saving…" : "Save settings"}
    </button>
  </div>
</div>
