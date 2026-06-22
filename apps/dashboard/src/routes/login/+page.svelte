<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import Icon from "$lib/components/Icon.svelte";
  import { apiFetch } from "$lib/api/fetch.js";

  let email = $state("");
  let password = $state("");
  let loading = $state(false);
  let errorMessage = $state("");

  const redirect = $derived($page.url.searchParams.get("redirect") ?? "/guide");

  async function signIn(event: Event) {
    event.preventDefault();
    loading = true;
    errorMessage = "";
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const text = await res.text();
        let message = text || "Sign in failed";
        try {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // use raw text
        }
        throw new Error(message);
      }
      const body = (await res.json()) as { mustResetPassword?: boolean };
      if (body.mustResetPassword) {
        await goto("/account/reset-password");
      } else {
        await goto(redirect);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Sign in failed";
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in - RunCanon</title>
</svelte:head>

<div class="flex min-h-[80vh] items-center justify-center">
  <div class="card w-full max-w-md p-8">
    <div class="mb-8 text-center">
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-hover))] text-white">
        <Icon name="cpu" size={28} />
      </div>
      <h1 class="text-2xl font-bold">Sign in to RunCanon</h1>
      <p class="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Default admin: admin@runcanon.ai (password reset required on first sign-in).
      </p>
    </div>

    <form class="space-y-4" onsubmit={signIn}>
      <div>
        <label class="mb-2 block text-sm font-medium" for="email">Email</label>
        <input id="email" type="email" class="input w-full" bind:value={email} required autocomplete="username" />
      </div>
      <div>
        <label class="mb-2 block text-sm font-medium" for="password">Password</label>
        <input id="password" type="password" class="input w-full" bind:value={password} required autocomplete="current-password" />
      </div>
      {#if errorMessage}
        <p class="text-sm text-[hsl(var(--destructive))]">{errorMessage}</p>
      {/if}
      <button type="submit" class="btn btn-primary w-full" disabled={loading}>
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  </div>
</div>
