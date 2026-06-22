<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let name = $state("");
  let description = $state("");
  let creating = $state(false);
  let expandedGroup = $state<string | null>(null);
  let addUserId = $state<Record<string, string>>({});
  let csvText = $state("email,groupSlug\nengineer@example.com,appsec");
  let importing = $state(false);

  async function importCsv(event: Event) {
    event.preventDefault();
    importing = true;
    try {
      const res = await apiFetch("/api/org/groups/import", {
        method: "POST",
        body: JSON.stringify({ csv: csvText }),
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { added: number; skipped: number; errors: string[] };
      toasts.success(`CSV import: ${body.added} added, ${body.skipped} skipped`);
      if (body.errors.length) toasts.error(body.errors.slice(0, 3).join("; "));
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      importing = false;
    }
  }

  async function createGroup(event: Event) {
    event.preventDefault();
    creating = true;
    try {
      const res = await apiFetch("/api/org/groups", {
        method: "POST",
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Group created");
      name = "";
      description = "";
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      creating = false;
    }
  }

  async function deleteGroup(groupId: string, groupName: string) {
    if (!confirm(`Delete group ${groupName}?`)) return;
    try {
      const res = await apiFetch(`/api/org/groups?groupId=${encodeURIComponent(groupId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Group deleted");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  async function addMember(groupId: string) {
    const userId = addUserId[groupId];
    if (!userId) return;
    try {
      const res = await apiFetch("/api/org/groups", {
        method: "POST",
        body: JSON.stringify({ action: "addMember", groupId, userId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Member added");
      addUserId[groupId] = "";
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Add failed");
    }
  }

  async function removeMember(groupId: string, userId: string) {
    try {
      const res = await apiFetch("/api/org/groups", {
        method: "POST",
        body: JSON.stringify({ action: "removeMember", groupId, userId }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Member removed");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Remove failed");
    }
  }

  function userLabel(userId: string): string {
    return data.users.find((u) => u.id === userId)?.email ?? userId;
  }
</script>

<svelte:head>
  <title>Groups - RunCanon Admin</title>
</svelte:head>

<div class="space-y-8">
  <div>
    <h1 class="text-2xl font-bold tracking-tight">Groups</h1>
    <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
      Organize engineers into teams for org skill assignments and RBAC.
    </p>
  </div>

  <form
    class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4"
    onsubmit={createGroup}
  >
    <h2 class="flex items-center gap-2 text-lg font-semibold">
      <Icon name="users" size={20} />
      Create group
    </h2>
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Name</span>
        <input
          class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
          bind:value={name}
          required
        />
      </label>
      <label class="block text-sm">
        <span class="mb-1 block text-[hsl(var(--muted-foreground))]">Description</span>
        <input
          class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
          bind:value={description}
        />
      </label>
    </div>
    <button
      type="submit"
      class="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
      disabled={creating}
    >
      {creating ? "Creating…" : "Create group"}
    </button>
  </form>

  <section class="space-y-4">
    {#each data.groups as group}
      <article class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="font-semibold">{group.name}</h3>
            <p class="text-xs text-[hsl(var(--muted-foreground))]">{group.slug} · {group.memberCount} members</p>
            {#if group.description}
              <p class="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{group.description}</p>
            {/if}
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-sm"
              onclick={() => (expandedGroup = expandedGroup === group.id ? null : group.id)}
            >
              {expandedGroup === group.id ? "Hide" : "Members"}
            </button>
            <button
              type="button"
              class="rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-600"
              onclick={() => deleteGroup(group.id, group.name)}
            >
              Delete
            </button>
          </div>
        </div>

        {#if expandedGroup === group.id}
          <div class="mt-4 border-t border-[hsl(var(--border))] pt-4">
            <ul class="mb-4 space-y-2 text-sm">
              {#each group.memberIds as memberId}
                <li class="flex items-center justify-between">
                  <span>{userLabel(memberId)}</span>
                  <button
                    type="button"
                    class="text-xs text-red-600"
                    onclick={() => removeMember(group.id, memberId)}
                  >
                    Remove
                  </button>
                </li>
              {:else}
                <li class="text-[hsl(var(--muted-foreground))]">No members yet.</li>
              {/each}
            </ul>
            <div class="flex flex-wrap gap-2">
              <select
                class="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm"
                bind:value={addUserId[group.id]}
              >
                <option value="">Add user…</option>
                {#each data.users as user}
                  {#if !group.memberIds.includes(user.id)}
                    <option value={user.id}>{user.email}</option>
                  {/if}
                {/each}
              </select>
              <button
                type="button"
                class="rounded-lg bg-[hsl(var(--primary))] px-3 py-2 text-sm text-[hsl(var(--primary-foreground))]"
                onclick={() => addMember(group.id)}
              >
                Add
              </button>
            </div>
          </div>
        {/if}
      </article>
    {:else}
      <p class="text-sm text-[hsl(var(--muted-foreground))]">No groups yet.</p>
    {/each}
  </section>

  <form
    class="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 space-y-4"
    onsubmit={importCsv}
  >
    <h2 class="text-lg font-semibold">Bulk import memberships (CSV)</h2>
    <p class="text-sm text-[hsl(var(--muted-foreground))]">
      Format: <code>email,groupSlug</code> per line. Use for IdP/SCIM-adjacent group sync workflows.
    </p>
    <textarea class="w-full rounded-lg border px-3 py-2 font-mono text-sm" rows="5" bind:value={csvText}></textarea>
    <button
      type="submit"
      class="rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm text-[hsl(var(--primary-foreground))]"
      disabled={importing}
    >
      {importing ? "Importing…" : "Import CSV"}
    </button>
  </form>
</div>
