<script lang="ts">
  import { goto } from "$app/navigation";
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";

  let newPassword = $state("");
  let confirmPassword = $state("");
  let loading = $state(false);
  let errorMessage = $state("");

  async function resetPassword(event: Event) {
    event.preventDefault();
    errorMessage = "";

    if (newPassword.length < 8) {
      errorMessage = "Password must be at least 8 characters";
      return;
    }
    if (newPassword !== confirmPassword) {
      errorMessage = "Passwords do not match";
      return;
    }

    loading = true;
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || "Password reset failed");
      }
      await goto("/guide");
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Password reset failed";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Set new password - RunCanon</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card w-full max-w-md p-8">
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-hover))] text-white">
        <Icon name="shield" size={28} />
      </div>
      <h1 class="text-2xl font-bold">Set a new password</h1>
      <p class="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        For security, you must choose a new password before continuing.
      </p>
    </div>

    <form class="space-y-4" onsubmit={resetPassword}>
      <div>
        <label class="mb-2 block text-sm font-medium" for="new-password">New password</label>
        <input
          id="new-password"
          type="password"
          class="input w-full"
          bind:value={newPassword}
          required
          minlength="8"
          autocomplete="new-password"
        />
      </div>
      <div>
        <label class="mb-2 block text-sm font-medium" for="confirm-password">Confirm password</label>
        <input
          id="confirm-password"
          type="password"
          class="input w-full"
          bind:value={confirmPassword}
          required
          minlength="8"
          autocomplete="new-password"
        />
      </div>
      {#if errorMessage}
        <p class="text-sm text-[hsl(var(--destructive))]">{errorMessage}</p>
      {/if}
      <button type="submit" class="btn btn-primary w-full" disabled={loading}>
        {loading ? "Saving..." : "Save and continue"}
      </button>
    </form>
  </div>
</div>
