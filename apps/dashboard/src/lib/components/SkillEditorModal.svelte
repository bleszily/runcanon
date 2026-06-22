<script lang="ts">
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";

  interface Props {
    open: boolean;
    title: string;
    skillId?: string;
    initialMarkdown?: string;
    apiPath: string;
    onClose: () => void;
    onSaved: () => void;
  }

  let {
    open,
    title,
    skillId,
    initialMarkdown = "",
    apiPath,
    onClose,
    onSaved,
  }: Props = $props();

  let markdown = $state("");
  let saving = $state(false);
  let loading = $state(false);

  const DEFAULT_TEMPLATE = `---
id: new-org-skill
name: New Org Skill
description: Describe what this skill helps agents accomplish.
version: 1
status: active
scope:
  - org-wide
harnesses:
  - cursor
tags:
  - org
triggers:
  - pattern: When the user asks for help with this workflow
metrics:
  frequency: 0
  successRate: 0
  failureRate: 0
  weaknessScore: 0
  stalenessScore: 0
  importanceScore: 0.5
  generatedAt: "${new Date().toISOString()}"
  sampleSize: 0
---

## workflow

1. **First step** — Describe the first action.

## validation

- [ERROR] Workflow completed successfully.
`;

  $effect(() => {
    if (open) {
      markdown = initialMarkdown;
      if (skillId && !initialMarkdown) {
        loadMarkdown();
      } else if (!skillId && !initialMarkdown) {
        markdown = DEFAULT_TEMPLATE;
      }
    }
  });

  async function loadMarkdown() {
    if (!skillId) return;
    loading = true;
    try {
      const res = await apiFetch(`${apiPath}?format=markdown`);
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { markdown: string };
      markdown = body.markdown;
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed to load skill");
    } finally {
      loading = false;
    }
  }

  async function save(event: Event) {
    event.preventDefault();
    saving = true;
    try {
      const res = await apiFetch(apiPath, {
        method: skillId ? "PATCH" : "POST",
        body: JSON.stringify(skillId ? { markdown } : { action: "create", markdown }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Skill saved");
      onSaved();
      onClose();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      saving = false;
    }
  }
</script>

{#if open}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-black/50" onclick={onClose} aria-hidden="true"></div>
    <form
      class="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] shadow-xl"
      onsubmit={save}
    >
      <div class="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
        <h2 class="text-lg font-semibold">{title}</h2>
        <button type="button" class="text-sm text-[hsl(var(--muted-foreground))]" onclick={onClose}>Close</button>
      </div>

      <div class="flex-1 overflow-hidden p-5">
        {#if loading}
          <p class="text-sm text-[hsl(var(--muted-foreground))]">Loading skill…</p>
        {:else}
          <label class="block h-full text-sm">
            <span class="mb-2 block text-[hsl(var(--muted-foreground))]">Canonical SKILL.md (YAML frontmatter + markdown)</span>
            <textarea
              class="h-[50vh] w-full resize-y rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-3 font-mono text-xs leading-relaxed"
              bind:value={markdown}
              required
            ></textarea>
          </label>
        {/if}
      </div>

      <div class="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-4">
        <button type="button" class="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm" onclick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
          disabled={saving || loading}
        >
          {saving ? "Saving…" : "Save skill"}
        </button>
      </div>
    </form>
  </div>
{/if}
