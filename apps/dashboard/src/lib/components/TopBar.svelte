<script lang="ts">
import { goto } from "$app/navigation";
import { onMount } from "svelte";
import { page } from "$app/stores";
import { apiFetch } from "$lib/api/fetch.js";
  import Icon from "./Icon.svelte";
  import { theme } from "$lib/theme.svelte";
  import type { Theme } from "$lib/theme.svelte";

  interface Props {
    breadcrumbs: { label: string; href?: string }[];
  }

  interface NotificationItem {
    id: string;
    type: "proposal" | "org_promotion" | "org_assignment" | "my_assignment" | "audit" | string;
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    href?: string;
  }

  let { breadcrumbs }: Props = $props();

  let themeOpen = $state(false);
  let notifOpen = $state(false);
  let notifications = $state<NotificationItem[]>([]);
  let unreadCount = $state(0);
  let loadingNotifications = $state(false);

  const workspaceLabel = $derived(
    $page.data.layout?.workspaceName ?? $page.data.layout?.projectName ?? "RunCanon"
  );
  const userEmail = $derived($page.data.layout?.user?.email ?? null);
  const isSignedIn = $derived(Boolean($page.data.layout?.user?.email));

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    await goto("/login");
  }

  function setTheme(value: Theme) {
    theme.set(value);
    themeOpen = false;
  }

  function themeIcon(value: Theme) {
    return value === "light" ? "sun" : value === "dark" ? "moon" : "monitor";
  }

  async function loadNotifications() {
    loadingNotifications = true;
    try {
      const res = await apiFetch("/api/notifications");
      if (!res.ok) return;
      const body = (await res.json()) as { notifications: NotificationItem[]; unreadCount: number };
      notifications = body.notifications;
      unreadCount = body.unreadCount;
    } finally {
      loadingNotifications = false;
    }
  }

  async function patchNotifications(action: "read" | "dismiss" | "read_all", ids: string[] | undefined = undefined) {
    const res = await apiFetch("/api/notifications", {
      method: "PATCH",
      body: JSON.stringify({ action, ids }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { notifications: NotificationItem[]; unreadCount: number };
    notifications = body.notifications;
    unreadCount = body.unreadCount;
  }

  async function markAllRead() {
    await patchNotifications("read_all");
  }

  async function dismissNotification(event: MouseEvent, id: string) {
    event.stopPropagation();
    await patchNotifications("dismiss", [id]);
  }

  onMount(() => {
    void loadNotifications();
    const interval = setInterval(() => void loadNotifications(), 60_000);
    return () => clearInterval(interval);
  });

  async function openNotification(item: NotificationItem) {
    if (!item.read) {
      await patchNotifications("read", [item.id]);
    }
    notifOpen = false;
    if (item.href) {
      await goto(item.href);
    }
  }

  function typeLabel(type: NotificationItem["type"]): string | null {
    switch (type) {
      case "proposal":
        return "Proposal";
      case "org_promotion":
        return "Org promotion";
      case "org_assignment":
        return "Org assignment";
      case "my_assignment":
        return "Skill assignment";
      case "audit":
        return "Activity";
      default:
        return null;
    }
  }

  function clickOutside(node: HTMLElement) {
    const handle = (e: MouseEvent) => {
      if (!node.contains(e.target as Node)) {
        themeOpen = false;
        notifOpen = false;
      }
    };
    document.addEventListener("click", handle, true);
    return {
      destroy() {
        document.removeEventListener("click", handle, true);
      },
    };
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
</script>

<header
  class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))/90] px-4 backdrop-blur lg:px-6"
>
  <nav aria-label="Breadcrumb" class="flex min-w-0 items-center gap-2 text-sm">
    {#each breadcrumbs as crumb, i}
      {#if i > 0}
        <Icon name="chevronRight" size={16} class="shrink-0 text-[hsl(var(--muted-foreground))]" />
      {/if}
      {#if crumb.href && i < breadcrumbs.length - 1}
        <a href={crumb.href} class="truncate text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          {crumb.label}
        </a>
      {:else}
        <span class="truncate font-semibold text-[hsl(var(--foreground))]">{crumb.label}</span>
      {/if}
    {/each}
  </nav>

  <div class="flex shrink-0 items-center gap-2" use:clickOutside>
    <div class="hidden items-center gap-2 rounded-lg border border-[hsl(var(--border))] px-3 py-1.5 text-xs sm:flex">
      <Icon name="package" size={14} class="text-[hsl(var(--primary))]" />
      <span class="max-w-[10rem] truncate font-medium">{workspaceLabel}</span>
    </div>

    {#if isSignedIn && userEmail}
      <div class="hidden items-center gap-2 md:flex">
        <span class="max-w-[8rem] truncate text-xs text-[hsl(var(--muted-foreground))]">{userEmail}</span>
        <button class="btn btn-ghost h-8 px-2 text-xs" onclick={signOut}>Sign out</button>
      </div>
    {/if}

    <div class="relative">
      <button
        onclick={() => (themeOpen = !themeOpen)}
        class="btn btn-ghost h-9 w-9 p-0"
        aria-label="Toggle theme"
      >
        <Icon name={themeIcon(theme.theme)} size={18} />
      </button>
      {#if themeOpen}
        <div
          class="absolute right-0 top-full mt-2 w-36 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] p-1 shadow-lg"
        >
          {#each ["light", "dark", "system"] as value}
            <button
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))] {theme.theme ===
              value
                ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                : 'text-[hsl(var(--popover-foreground))]'}"
              onclick={() => setTheme(value as Theme)}
            >
              <Icon name={themeIcon(value as Theme)} size={16} />
              <span class="capitalize">{value}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="relative">
      <button
        onclick={() => {
          notifOpen = !notifOpen;
          if (notifOpen) void loadNotifications();
        }}
        class="btn btn-ghost relative h-9 w-9 p-0"
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
        {#if unreadCount > 0}
          <span class="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(var(--destructive))] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        {/if}
      </button>
      {#if notifOpen}
        <div
          class="absolute right-0 top-full mt-2 w-80 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--popover))] p-3 shadow-lg"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Notifications
            </p>
            {#if unreadCount > 0}
              <button
                type="button"
                class="text-[10px] font-medium text-[hsl(var(--primary))] hover:underline"
                onclick={() => void markAllRead()}
              >
                Mark all read
              </button>
            {/if}
          </div>
          {#if loadingNotifications}
            <p class="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
          {:else if notifications.length === 0}
            <p class="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No notifications yet.</p>
          {:else}
            <div class="max-h-72 space-y-2 overflow-y-auto">
              {#each notifications as item}
                <div
                  class="group relative rounded-lg bg-[hsl(var(--muted))]/50 p-2 text-sm {!item.read
                    ? 'ring-1 ring-[hsl(var(--primary))]/30'
                    : ''}"
                >
                  <button
                    type="button"
                    class="absolute right-1 top-1 rounded p-1 text-[hsl(var(--muted-foreground))] opacity-0 transition hover:bg-[hsl(var(--background))] hover:text-[hsl(var(--foreground))] group-hover:opacity-100"
                    aria-label="Dismiss notification"
                    onclick={(event) => void dismissNotification(event, item.id)}
                  >
                    <Icon name="x" size={14} />
                  </button>
                  {#if item.href}
                    <button type="button" class="w-full pr-6 text-left" onclick={() => void openNotification(item)}>
                      {#if typeLabel(item.type)}
                        <p class="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--primary))]">
                          {typeLabel(item.type)}
                        </p>
                      {/if}
                      <p class="font-medium">{item.title}</p>
                      <p class="line-clamp-3 text-xs text-[hsl(var(--muted-foreground))]">{item.message}</p>
                      <p class="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatTime(item.timestamp)}</p>
                    </button>
                  {:else}
                    {#if typeLabel(item.type)}
                      <p class="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                        {typeLabel(item.type)}
                      </p>
                    {/if}
                    <p class="pr-6 font-medium">{item.title}</p>
                    <p class="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{item.message}</p>
                    <p class="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">{formatTime(item.timestamp)}</p>
                  {/if}
                </div>
              {/each}
            </div>
            {#if notifications.some((n) => n.type === "proposal" && !n.read)}
              <a
                href="/proposals"
                class="mt-3 block rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-center text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/50"
                onclick={() => (notifOpen = false)}
              >
                View proposals
              </a>
            {/if}
            {#if notifications.some((n) => (n.type === "org_promotion" || n.type === "org_assignment") && !n.read)}
              <a
                href="/admin/promotions"
                class="mt-2 block rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-center text-xs font-medium text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/50"
                onclick={() => (notifOpen = false)}
              >
                Org admin queue
              </a>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>
