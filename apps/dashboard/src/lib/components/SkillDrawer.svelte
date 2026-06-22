<script lang="ts">
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import { focusTrap } from "$lib/actions/focusTrap";
  import { invalidateAll } from "$app/navigation";
  import { toasts } from "$lib/stores/toasts";
  import type { Skill } from "$lib/types";

  interface Props {
    skill: Skill | null;
    onClose: () => void;
  }

  let { skill, onClose }: Props = $props();
  let loading = $state(false);

  const statusVariant = (status: Skill["status"]) => {
    switch (status) {
      case "active":
        return "success";
      case "proposed":
        return "warning";
      case "retired":
        return "danger";
      case "deprecated":
        return "muted";
      default:
        return "default";
    }
  };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  async function retireSkillAction() {
    if (!skill) return;
    loading = true;
    try {
      const res = await fetch(`/api/skills/${skill.id}/retire`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`Retired "${skill.name}"`);
      onClose();
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to retire skill");
    } finally {
      loading = false;
    }
  }
</script>

{#if skill}
  <div class="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="skill-drawer-title" tabindex="-1" use:focusTrap={onClose}>
    <div class="absolute inset-0 bg-black/40" onclick={onClose} aria-hidden="true"></div>
    <div
      class="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-2xl transition-transform duration-300"
    >
      <div class="flex items-center justify-between border-b border-[hsl(var(--border))] p-5">
        <h2 id="skill-drawer-title" class="text-lg font-semibold">{skill.name}</h2>
        <button class="btn btn-ghost h-8 w-8 p-0" onclick={onClose} aria-label="Close">
          <Icon name="x" size={20} />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-5">
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={statusVariant(skill.status)}>{skill.status}</Badge>
          {#each skill.tags as tag}
            <Badge variant="muted">#{tag}</Badge>
          {/each}
        </div>

        <p class="mb-6 text-[hsl(var(--muted-foreground))]">{skill.description}</p>

        <div class="mb-6 grid grid-cols-3 gap-3">
          <div class="card p-3 text-center">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">7d calls</p>
            <p class="text-lg font-bold">{skill.usage.calls7d.toLocaleString()}</p>
          </div>
          <div class="card p-3 text-center">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">30d calls</p>
            <p class="text-lg font-bold">{skill.usage.calls30d.toLocaleString()}</p>
          </div>
          <div class="card p-3 text-center">
            <p class="text-xs text-[hsl(var(--muted-foreground))]">Success</p>
            <p class="text-lg font-bold text-[hsl(var(--success))]">{Math.round(skill.usage.successRate * 100)}%</p>
          </div>
        </div>

        <div class="mb-6">
          <h4 class="mb-2 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Harnesses</h4>
          <div class="flex flex-wrap gap-2">
            {#each skill.harnesses as harness}
              <div class="card flex items-center gap-2 px-3 py-1.5 text-sm" title={harness.id}>
                <Icon name={harness.type} size={16} />
                <span>{harness.label}</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="mb-6">
          <h4 class="mb-2 text-sm font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Skill spec</h4>
          <div class="card bg-[hsl(var(--muted))]/30 p-4 font-mono text-xs whitespace-pre-wrap">{skill.markdown}</div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs text-[hsl(var(--muted-foreground))]">
          <div>Created: {formatDate(skill.createdAt)}</div>
          <div>Updated: {formatDate(skill.updatedAt)}</div>
        </div>
      </div>

      <div class="flex items-center gap-3 border-t border-[hsl(var(--border))] p-5">
        {#if skill.status !== "retired"}
          <button class="btn btn-secondary flex-1 text-[hsl(var(--destructive))]" onclick={retireSkillAction} disabled={loading}>
            Retire skill
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
