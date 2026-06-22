<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { apiFetch } from "$lib/api/fetch.js";
  import SearchableSelect from "$lib/components/SearchableSelect.svelte";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let skillId = $state("");
  let targetType = $state<"user" | "group">("user");
  let targetId = $state("");
  let mandatory = $state(false);
  let expiresAt = $state("");
  let projectSlug = $state("");
  let saving = $state(false);

  $effect(() => {
    targetType;
    targetId = "";
  });

  async function createAssignment(event: Event) {
    event.preventDefault();
    saving = true;
    try {
      const res = await apiFetch("/api/org/assignments", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          targetType,
          targetId,
          mandatory,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          projectSlug: projectSlug.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Assignment created");
      skillId = "";
      targetId = "";
      mandatory = false;
      expiresAt = "";
      projectSlug = "";
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Failed");
    } finally {
      saving = false;
    }
  }

  async function removeAssignment(assignmentId: string) {
    try {
      const res = await apiFetch(
        `/api/org/assignments?assignmentId=${encodeURIComponent(assignmentId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Assignment removed");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Remove failed");
    }
  }

  function targetLabel(type: string, id: string): string {
    if (type === "user") return data.users.find((u) => u.id === id)?.email ?? id;
    return data.groups.find((g) => g.id === id)?.name ?? id;
  }

  const skillOptions = $derived(
    data.skills.map((skill) => ({
      value: skill.id,
      label: `${skill.name} (${skill.id})`,
      keywords: skill.name,
    }))
  );

  const targetOptions = $derived(
    targetType === "user"
      ? data.users.map((user) => ({
          value: user.id,
          label: user.email,
          keywords: user.email,
        }))
      : data.groups.map((group) => ({
          value: group.id,
          label: group.name,
          keywords: group.slug,
        }))
  );
</script>

<svelte:head>
  <title>Skill assignments - RunCanon Admin</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Skill assignments</h1>
    <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
      Push org library skills to specific users or groups. Engineers sync via MCP <code>runcanon_sync_skills</code>.
      Assignments only use skills published to the <a href="/admin/org-skills" class="underline">org library</a> — workspace skills must be published first.
    </p>
  </div>

  {#if data.skills.length === 0}
    <div
      class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100"
      role="status"
    >
      <p class="font-medium">No org library skills yet</p>
      <p class="mt-1 text-[hsl(var(--muted-foreground))]">
        The dropdown only lists skills published to the org library. Workspace skills (Skills page) are not assignable
        until you publish them.
      </p>
      {#if data.unpublishedWorkspace.length > 0}
        <p class="mt-2">
          In your current workspace, publish first:
          {#each data.unpublishedWorkspace as skill, i}
            <span class="font-mono text-xs">{skill.name}</span>{i < data.unpublishedWorkspace.length - 1 ? ", " : "."}
          {/each}
        </p>
      {:else}
        <p class="mt-2">
          Switch to an engineer workspace under <a href="/settings" class="underline">Settings</a>, or create/import a
          skill, then publish from the org library page.
        </p>
      {/if}
      <a
        href="/admin/org-skills"
        class="mt-3 inline-block rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-sm text-[hsl(var(--primary-foreground))]"
      >
        Open org library → Publish skill
      </a>
    </div>
  {/if}

  <form
    class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4"
    onsubmit={createAssignment}
  >
    <h2 class="text-lg font-semibold">New assignment</h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Org skill</span>
        <SearchableSelect
          id="assignment-skill"
          options={skillOptions}
          bind:value={skillId}
          placeholder="Select skill…"
          searchPlaceholder="Search skills by name or id…"
          required
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Target type</span>
        <select
          class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
          bind:value={targetType}
        >
          <option value="user">User</option>
          <option value="group">Group</option>
        </select>
      </label>
      <label class="block text-sm sm:col-span-2">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Target</span>
        <SearchableSelect
          id="assignment-target"
          options={targetOptions}
          bind:value={targetId}
          placeholder="Select…"
          searchPlaceholder={targetType === "user" ? "Search users by email…" : "Search groups by name…"}
          required
        />
      </label>
    </div>
    <label class="flex items-center gap-2 text-sm">
      <input type="checkbox" bind:checked={mandatory} />
      Mandatory (enforced on sync — missing skills are auto-included)
    </label>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Expires at (optional)</span>
        <input type="datetime-local" class="w-full rounded-lg border px-3 py-2" bind:value={expiresAt} />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Project scope (path fragment)</span>
        <input
          type="text"
          placeholder="e.g. security-mcp"
          class="w-full rounded-lg border px-3 py-2"
          bind:value={projectSlug}
        />
      </label>
    </div>
    <button
      type="submit"
      class="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
      disabled={saving}
    >
      {saving ? "Saving…" : "Assign skill"}
    </button>
  </form>

  <section class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
    <h2 class="mb-4 text-lg font-semibold">Current assignments</h2>
    {#if data.assignments.length === 0}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">No assignments yet.</p>
    {:else}
      <ul class="divide-y divide-[hsl(var(--border))]">
        {#each data.assignments as assignment}
          <li class="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <span class="font-medium">{assignment.skillId}</span>
              → {assignment.targetType}: {targetLabel(assignment.targetType, assignment.targetId)}
              {#if assignment.mandatory}
                <span class="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">mandatory</span>
              {/if}
              {#if assignment.expiresAt}
                <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">expires {new Date(assignment.expiresAt).toLocaleDateString()}</span>
              {/if}
              {#if assignment.projectSlug}
                <span class="ml-2 text-xs text-[hsl(var(--muted-foreground))]">project:{assignment.projectSlug}</span>
              {/if}
            </div>
            <button
              type="button"
              class="text-xs text-red-600"
              onclick={() => removeAssignment(assignment.id)}
            >
              Remove
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>
