<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";

  let { data } = $props();

  let loading = $state(false);
  let errorMessage = $state("");

  async function authorize(event: Event) {
    event.preventDefault();
    loading = true;
    errorMessage = "";
    try {
      const res = await apiFetch("/api/auth/cli/approve", {
        method: "POST",
        body: JSON.stringify({ state: data.state }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Authorization failed");
      }
      const body = (await res.json()) as { redirectUri: string; code: string };
      const callback = new URL(body.redirectUri);
      callback.searchParams.set("code", body.code);
      callback.searchParams.set("state", data.state);
      window.location.href = callback.toString();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Authorization failed";
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Authorize CLI - RunCanon</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card w-full max-w-md p-8">
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-hover))] text-white">
        <Icon name="terminal" size={28} />
      </div>
      <h1 class="text-2xl font-bold">Authorize RunCanon CLI</h1>
      <p class="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Signed in as <strong>{data.userEmail}</strong>. Allow the CLI on this machine to access your workspace?
      </p>
    </div>

    <form class="space-y-4" onsubmit={authorize}>
      {#if errorMessage}
        <p class="text-sm text-[hsl(var(--destructive))]">{errorMessage}</p>
      {/if}
      <button type="submit" class="btn btn-primary w-full" disabled={loading}>
        {loading ? "Authorizing..." : "Authorize CLI"}
      </button>
    </form>
  </div>
</div>
