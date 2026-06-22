<script lang="ts">
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import Sidebar from "./Sidebar.svelte";
  import TopBar from "./TopBar.svelte";
  import CommandPalette from "./CommandPalette.svelte";
  import Icon from "./Icon.svelte";
  import { theme } from "$lib/theme.svelte";

  interface Props {
    children: import("svelte").Snippet;
  }

  let { children }: Props = $props();

  const isAuthPage = $derived(
    $page.url.pathname === "/login" || $page.url.pathname === "/account/reset-password"
  );

  let mobileOpen = $state(false);
  let commandOpen = $state(false);
  let sidebarCollapsed = $state(false);

  onMount(() => {
    if (browser) {
      const stored = localStorage.getItem("runcanon-sidebar-collapsed");
      if (stored === "true") sidebarCollapsed = true;

      function onKey(e: KeyboardEvent) {
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          commandOpen = !commandOpen;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "b") {
          e.preventDefault();
          toggleSidebar();
        }
      }
      window.addEventListener("keydown", onKey);
      theme.init();
      return () => window.removeEventListener("keydown", onKey);
    }
  });

  const breadcrumbMap: Record<string, string> = {
    "/": "Overview",
    "/guide": "Guide",
    "/skills": "Skills",
    "/proposals": "Proposals",
    "/trajectories": "Trajectories",
    "/autonomy": "Autonomy",
    "/settings": "Settings",
    "/admin/users": "Users",
    "/admin/groups": "Groups",
    "/admin/providers": "Providers",
    "/admin/org-skills": "Org library",
    "/admin/promotions": "Promotions",
    "/admin/assignments": "Assignments",
    "/admin/metrics": "Metrics",
  };

  const breadcrumbs = $derived.by(() => {
    const pathname = $page.url.pathname;
    const label = breadcrumbMap[pathname] ?? "Page";
    return [{ label: "RunCanon", href: "/" }, { label }];
  });

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    if (browser) {
      localStorage.setItem("runcanon-sidebar-collapsed", String(sidebarCollapsed));
    }
  }
</script>

<div class="flex min-h-screen bg-[hsl(var(--background))]">
  {#if isAuthPage}
    <main class="flex flex-1 items-center justify-center p-4">
      {@render children()}
    </main>
  {:else}
  <div class="hidden lg:block">
    <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
  </div>

  {#if mobileOpen}
    <div class="fixed inset-0 z-40 lg:hidden">
      <div class="absolute inset-0 bg-black/40" onclick={() => (mobileOpen = false)} aria-hidden="true"></div>
      <div class="relative z-10">
        <Sidebar collapsed={false} onToggle={() => (mobileOpen = false)} />
      </div>
    </div>
  {/if}

  <div class="flex flex-1 flex-col min-w-0">
    <div class="flex items-center gap-3 px-4 lg:hidden">
      <button
        onclick={() => (mobileOpen = true)}
        class="btn btn-ghost h-9 w-9 p-0"
        aria-label="Open navigation"
      >
        <Icon name="menu" size={20} />
      </button>
      <a href="/" class="flex items-center gap-2">
        <div
          class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--accent))] text-white"
        >
          <Icon name="cpu" size={16} />
        </div>
        <span class="text-lg font-bold text-gradient">RunCanon</span>
      </a>
    </div>

    <TopBar {breadcrumbs} />

    <main class="flex-1 p-4 lg:p-8">
      <div class="mx-auto max-w-7xl">
        {@render children()}
      </div>
    </main>
  </div>
  {/if}
</div>
{#if !isAuthPage}
<CommandPalette open={commandOpen} onClose={() => (commandOpen = false)} />
{/if}
