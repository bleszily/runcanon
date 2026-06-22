<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";
  import { toasts } from "$lib/stores/toasts";
  import type { PageData } from "./$types";
  import type { UserRole } from "@runcanon/platform";

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let showCreate = $state(false);
  let creating = $state(false);
  let email = $state("");
  let name = $state("");
  let password = $state("");
  let role = $state<UserRole>("engineer");
  let mustResetPassword = $state(true);

  const roleLabels: Record<UserRole, string> = {
    admin: "Admin",
    curator: "Curator",
    engineer: "Engineer",
    viewer: "Viewer",
  };

  async function createUser(event: Event) {
    event.preventDefault();
    creating = true;
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, name, password, role, mustResetPassword }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("User created");
      showCreate = false;
      email = "";
      name = "";
      password = "";
      role = "engineer";
      mustResetPassword = true;
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      creating = false;
    }
  }

  async function updateRole(userId: string, newRole: UserRole) {
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("Role updated");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Update failed");
    }
  }

  async function forceReset(userId: string) {
    try {
      const res = await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({ userId, action: "requirePasswordReset" }),
      });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("User must reset password on next login");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Update failed");
    }
  }

  async function removeUser(userId: string, userEmail: string) {
    if (!confirm(`Delete ${userEmail}? This cannot be undone.`)) return;
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toasts.success("User deleted");
      await invalidateAll();
    } catch (error) {
      toasts.error(error instanceof Error ? error.message : "Delete failed");
    }
  }
</script>

<svelte:head>
  <title>User management - RunCanon Admin</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">User management</h1>
      <p class="text-[hsl(var(--muted-foreground))]">
        Create accounts, assign roles, and manage password reset requirements.
      </p>
    </div>
    <button type="button" class="btn btn-primary" onclick={() => (showCreate = !showCreate)}>
      <Icon name="plus" size={16} />
      Add user
    </button>
  </div>

  {#if showCreate}
    <form class="card space-y-4 p-6" onsubmit={createUser}>
      <h2 class="text-lg font-semibold">New user</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-2 block text-sm font-medium" for="user-email">Email</label>
          <input id="user-email" type="email" class="input w-full" bind:value={email} required />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium" for="user-name">Name</label>
          <input id="user-name" type="text" class="input w-full" bind:value={name} required />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium" for="user-password">Temporary password</label>
          <input id="user-password" type="password" class="input w-full" bind:value={password} required minlength="8" />
        </div>
        <div>
          <label class="mb-2 block text-sm font-medium" for="user-role">Role</label>
          <select id="user-role" class="input w-full" bind:value={role}>
            <option value="admin">Admin</option>
            <option value="curator">Curator</option>
            <option value="engineer">Engineer</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" bind:checked={mustResetPassword} />
        Require password reset on first login
      </label>
      <div class="flex gap-2">
        <button type="submit" class="btn btn-primary" disabled={creating}>
          {creating ? "Creating..." : "Create user"}
        </button>
        <button type="button" class="btn btn-ghost" onclick={() => (showCreate = false)}>Cancel</button>
      </div>
    </form>
  {/if}

  <div class="card overflow-hidden">
    <table class="w-full text-sm">
      <thead class="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
        <tr>
          <th class="px-4 py-3 text-left font-medium">Name</th>
          <th class="px-4 py-3 text-left font-medium">Email</th>
          <th class="px-4 py-3 text-left font-medium">Role</th>
          <th class="px-4 py-3 text-left font-medium">Status</th>
          <th class="px-4 py-3 text-right font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user (user.id)}
          <tr class="border-b border-[hsl(var(--border))] last:border-0">
            <td class="px-4 py-3 font-medium">{user.name}</td>
            <td class="px-4 py-3 text-[hsl(var(--muted-foreground))]">{user.email}</td>
            <td class="px-4 py-3">
              {#if user.id === data.currentUserId}
                <span class="rounded-full bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--primary))]">
                  {roleLabels[user.role]} (you)
                </span>
              {:else}
                <select
                  class="input py-1 text-xs"
                  value={user.role}
                  onchange={(e) => updateRole(user.id, (e.currentTarget as HTMLSelectElement).value as UserRole)}
                >
                  <option value="admin">Admin</option>
                  <option value="curator">Curator</option>
                  <option value="engineer">Engineer</option>
                  <option value="viewer">Viewer</option>
                </select>
              {/if}
            </td>
            <td class="px-4 py-3">
              {#if user.mustResetPassword}
                <span class="text-xs text-[hsl(var(--destructive))]">Reset required</span>
              {:else}
                <span class="text-xs text-[hsl(var(--muted-foreground))]">Active</span>
              {/if}
            </td>
            <td class="px-4 py-3">
              <div class="flex justify-end gap-2">
                {#if user.id !== data.currentUserId}
                  <button type="button" class="btn btn-ghost btn-sm text-xs" onclick={() => forceReset(user.id)}>
                    Force reset
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm text-xs text-[hsl(var(--destructive))]"
                    onclick={() => removeUser(user.id, user.email)}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
