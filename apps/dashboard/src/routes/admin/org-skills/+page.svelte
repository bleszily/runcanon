<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import Icon from "$lib/components/Icon.svelte";
  import SkillEditorModal from "$lib/components/SkillEditorModal.svelte";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let publishing = $state<string | null>(null);
  let archiving = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let showImport = $state(false);
  let importing = $state(false);
  let showCreate = $state(false);
  let editSkillId = $state<string | null>(null);

  let repoUrl = $state("");
  let branch = $state("main");
  let token = $state("");
  let destination = $state<"workspace" | "org" | "proposal">("org");
  let enrich = $state(false);
  let importResult = $state<Array<{ skillId: string; name: string; assessment: { score: number; rationale: string } }>>([]);

  async function publish(skillId: string) {
    publishing = skillId;
    try {
      const res = await apiFetch("/api/org/skills", {
        method: "POST",
        body: JSON.stringify({ skillId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`Published ${skillId} to org library`);
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Publish failed");
    } finally {
      publishing = null;
    }
  }

  async function archive(skillId: string) {
    if (!confirm(`Archive org skill "${skillId}"? Assignments will be removed.`)) return;
    archiving = skillId;
    try {
      const res = await apiFetch("/api/org/skills", {
        method: "POST",
        body: JSON.stringify({ skillId, action: "archive" }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Skill archived");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Archive failed");
    } finally {
      archiving = null;
    }
  }

  async function removeSkill(skillId: string, name: string) {
    const confirmed = confirm(
      `Permanently delete "${name}" (${skillId})?\n\nThis removes the org skill, its markdown file, assignments, and pending promotions. This cannot be undone.`
    );
    if (!confirmed) return;
    deleting = skillId;
    try {
      const res = await apiFetch(`/api/org/skills/${encodeURIComponent(skillId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success(`Deleted ${skillId}`);
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Delete failed");
    } finally {
      deleting = null;
    }
  }

  const canDelete = $derived($page.data.layout?.isAdmin === true);

  async function runImport(event: Event) {
    event.preventDefault();
    importing = true;
    importResult = [];
    try {
      const res = await apiFetch("/api/org/skills/import", {
        method: "POST",
        body: JSON.stringify({ repoUrl, branch, token: token || undefined, destination, enrich }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as {
        imported: Array<{ skillId: string; name: string; assessment: { score: number; rationale: string } }>;
        llmUsed: boolean;
        enrichSkippedReason?: string;
      };
      importResult = body.imported;
      const enrichNote = body.llmUsed
        ? " with LLM enrichment"
        : body.enrichSkippedReason
          ? " (heuristics only — bulk import)"
          : "";
      toasts.success(`Imported ${body.imported.length} skill(s)${enrichNote}`);
      showImport = false;
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      importing = false;
    }
  }

  const publishedIds = $derived(new Set(data.orgSkills.map((s) => s.id)));
  const unpublished = $derived(data.workspaceActive.filter((s) => !publishedIds.has(s.id)));
</script>

<svelte:head>
  <title>Org skill library - RunCanon</title>
</svelte:head>

<div class="space-y-8">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">Org skill library</h1>
      <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
        Create, import from GitHub/Bitbucket, edit, and publish skills to your organization library.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]"
        onclick={() => (showImport = true)}
      >
        Import from Git
      </button>
      <button
        type="button"
        class="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))]"
        onclick={() => (showCreate = true)}
      >
        Create skill
      </button>
    </div>
  </div>

  <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
      <Icon name="skills" size={20} />
      Published skills
    </h2>
    {#if data.orgSkills.length === 0}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        No org skills yet. Import from a Git repo, create one, or promote from your workspace below.
      </p>
    {:else}
      <ul class="divide-y divide-[hsl(var(--border))]">
        {#each data.orgSkills as record}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="font-medium">{record.name}</p>
              <p class="text-xs text-[hsl(var(--muted-foreground))]">
                {record.id} · v{record.version} · {record.publishedBy}
              </p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm"
                onclick={() => (editSkillId = record.id)}
              >
                Edit
              </button>
              <button
                type="button"
                class="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm hover:bg-[hsl(var(--muted))]"
                disabled={archiving === record.id || deleting === record.id}
                onclick={() => archive(record.id)}
              >
                {archiving === record.id ? "Archiving…" : "Archive"}
              </button>
              {#if canDelete}
                <button
                  type="button"
                  class="rounded-lg border border-[hsl(var(--destructive))]/40 px-3 py-1.5 text-sm text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10"
                  disabled={deleting === record.id || archiving === record.id}
                  onclick={() => removeSkill(record.id, record.name)}
                >
                  {deleting === record.id ? "Deleting…" : "Delete"}
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="mb-4 text-lg font-semibold">Promote from workspace</h2>
    {#if unpublished.length === 0}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">All active workspace skills are already published.</p>
    {:else}
      <ul class="divide-y divide-[hsl(var(--border))]">
        {#each unpublished as skill}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="font-medium">{skill.name}</p>
              <p class="text-xs text-[hsl(var(--muted-foreground))">{skill.id}</p>
            </div>
            <button
              type="button"
              class="rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))] hover:opacity-90"
              disabled={publishing === skill.id}
              onclick={() => publish(skill.id)}
            >
              {publishing === skill.id ? "Publishing…" : "Publish to org"}
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  {#if importResult.length > 0}
    <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <h2 class="mb-4 text-lg font-semibold">Last import</h2>
      <ul class="space-y-2 text-sm">
        {#each importResult as item}
          <li>
            <span class="font-medium">{item.name}</span>
            · {Math.round(item.assessment.score * 100)}% — {item.assessment.rationale}
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.audit.length > 0}
    <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
      <h2 class="mb-4 text-lg font-semibold">Recent org audit</h2>
      <ul class="space-y-2 text-sm">
        {#each data.audit as entry}
          <li class="text-[hsl(var(--muted-foreground))]">
            <span class="text-[hsl(var(--foreground))]">{entry.action}</span>
            · {entry.actor} · {entry.resourceId ?? "—"}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

{#if showImport}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <div class="absolute inset-0 bg-black/50" onclick={() => (showImport = false)} aria-hidden="true"></div>
    <form
      class="relative z-10 w-full max-w-lg space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-xl"
      onsubmit={runImport}
    >
      <h2 class="text-lg font-semibold">Import skills from Git</h2>
      <p class="text-sm text-[hsl(var(--muted-foreground))]">
        Supports public and private GitHub / Bitbucket repos. Discovers SKILL.md files under skills directories.
        Tokens are used once and not stored.
      </p>
      <label class="block text-sm">
        <span class="mb-1 block">Repository URL</span>
        <input
          class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
          placeholder="https://github.com/org/repo or https://bitbucket.org/workspace/repo"
          bind:value={repoUrl}
          required
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block">Branch</span>
        <input class="w-full rounded-lg border border-[hsl(var(--border))] px-3 py-2" bind:value={branch} />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block">Access token (recommended for GitHub)</span>
        <input
          type="password"
          autocomplete="off"
          class="w-full rounded-lg border border-[hsl(var(--border))] px-3 py-2"
          bind:value={token}
          placeholder="GitHub PAT — avoids rate limits; required for private repos"
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block">Destination</span>
        <select class="w-full rounded-lg border border-[hsl(var(--border))] px-3 py-2" bind:value={destination}>
          <option value="org">Org library (recommended)</option>
          <option value="workspace">Workspace only</option>
          <option value="proposal">Proposals (review first)</option>
        </select>
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input type="checkbox" bind:checked={enrich} class="mt-1" />
        <span>
          Assess and enrich with LLM (≤5 skills only; larger repos import in seconds with heuristics)
        </span>
      </label>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" class="rounded-lg border px-4 py-2 text-sm" onclick={() => (showImport = false)}>
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
          disabled={importing}
        >
          {importing ? "Importing…" : "Import"}
        </button>
      </div>
    </form>
  </div>
{/if}

<SkillEditorModal
  open={showCreate}
  title="Create org skill"
  apiPath="/api/org/skills"
  initialMarkdown=""
  onClose={() => (showCreate = false)}
  onSaved={() => invalidateAll()}
/>

<SkillEditorModal
  open={editSkillId !== null}
  title="Edit org skill"
  skillId={editSkillId ?? undefined}
  apiPath={editSkillId ? `/api/org/skills/${editSkillId}` : "/api/org/skills"}
  onClose={() => (editSkillId = null)}
  onSaved={() => invalidateAll()}
/>
