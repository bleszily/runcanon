<script lang="ts">
  import { browser } from "$app/environment";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "$lib/icons";

  interface Props {
    collapsed: boolean;
    onToggle: () => void;
  }

  interface NavLink {
    label: string;
    href: string;
    icon: IconName;
    badge?: number;
  }

  interface NavGroup {
    id: string;
    label: string;
    defaultOpen: boolean;
    items: NavLink[];
  }

  let { collapsed, onToggle }: Props = $props();

  const NAV_GROUPS_STORAGE_KEY = "runcanon-nav-groups";

  const defaultOpenGroups: Record<string, boolean> = {
    workspace: true,
    governance: false,
    "user-management": false,
    "org-skills": true,
    platform: false,
  };

  let openGroups = $state<Record<string, boolean>>({ ...defaultOpenGroups });

  function isNavActive(href: string, pathname: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function groupHasActiveItem(group: NavGroup, pathname: string): boolean {
    return group.items.some((item) => isNavActive(item.href, pathname));
  }

  function loadOpenGroups(): Record<string, boolean> {
    if (!browser) return { ...defaultOpenGroups };
    try {
      const stored = localStorage.getItem(NAV_GROUPS_STORAGE_KEY);
      if (!stored) return { ...defaultOpenGroups };
      return { ...defaultOpenGroups, ...(JSON.parse(stored) as Record<string, boolean>) };
    } catch {
      return { ...defaultOpenGroups };
    }
  }

  function persistOpenGroups(state: Record<string, boolean>): void {
    if (!browser) return;
    localStorage.setItem(NAV_GROUPS_STORAGE_KEY, JSON.stringify(state));
  }

  function toggleGroup(id: string): void {
    openGroups = { ...openGroups, [id]: !openGroups[id] };
    persistOpenGroups(openGroups);
  }

  function isGroupOpen(id: string): boolean {
    return openGroups[id] ?? defaultOpenGroups[id] ?? false;
  }

  const layout = $derived($page.data.layout);

  const topLinks = $derived.by((): NavLink[] => [
    { label: "Guide", href: "/guide", icon: "globe" },
    { label: "Overview", href: "/", icon: "home" },
  ]);

  const navGroups = $derived.by((): NavGroup[] => {
    const groups: NavGroup[] = [
      {
        id: "workspace",
        label: "Workspace",
        defaultOpen: true,
        items: [
          { label: "Skills", href: "/skills", icon: "skills" },
          {
            label: "Proposals",
            href: "/proposals",
            icon: "proposals",
            badge: layout?.pendingProposals,
          },
          { label: "Trajectories", href: "/trajectories", icon: "trajectories" },
        ],
      },
      {
        id: "governance",
        label: "Governance",
        defaultOpen: false,
        items: [
          { label: "Autonomy", href: "/autonomy", icon: "autonomy" },
          { label: "Settings", href: "/settings", icon: "settings" },
        ],
      },
    ];

    const userManagement: NavLink[] = [];
    if (layout?.isAdmin) {
      userManagement.push({ label: "Users", href: "/admin/users", icon: "users" });
    }
    if (layout?.isOrgAdmin) {
      userManagement.push({ label: "Groups", href: "/admin/groups", icon: "users" });
    }
    if (userManagement.length > 0) {
      groups.push({
        id: "user-management",
        label: "User management",
        defaultOpen: false,
        items: userManagement,
      });
    }

    if (layout?.isOrgAdmin) {
      groups.push({
        id: "org-skills",
        label: "Org skills",
        defaultOpen: true,
        items: [
          { label: "Org library", href: "/admin/org-skills", icon: "skills" },
          { label: "Promotions", href: "/admin/promotions", icon: "proposals" },
          { label: "Assignments", href: "/admin/assignments", icon: "proposals" },
        ],
      });
    }

    const platform: NavLink[] = [];
    if (layout?.isAdmin) {
      platform.push({ label: "Providers", href: "/admin/providers", icon: "shield" });
    }
    if (layout?.isOrgAdmin) {
      platform.push({ label: "Metrics", href: "/admin/metrics", icon: "autonomy" });
    }
    if (platform.length > 0) {
      groups.push({
        id: "platform",
        label: "Platform",
        defaultOpen: false,
        items: platform,
      });
    }

    return groups;
  });

  const flatLinks = $derived.by((): NavLink[] => {
    if (!collapsed) return [];
    return [
      ...topLinks,
      ...navGroups.flatMap((group) => group.items),
    ];
  });

  const autonomyText = $derived.by(() => {
    const label = layout?.autonomyLabel ?? "ask";
    return label.replace("-", " ");
  });

  onMount(() => {
    openGroups = loadOpenGroups();
  });

  $effect(() => {
    const pathname = $page.url.pathname;
    let changed = false;
    const next = { ...openGroups };
    for (const group of navGroups) {
      if (groupHasActiveItem(group, pathname) && !next[group.id]) {
        next[group.id] = true;
        changed = true;
      }
    }
    if (changed) {
      openGroups = next;
      persistOpenGroups(openGroups);
    }
  });

  function groupBadge(group: NavGroup): number | undefined {
    const total = group.items.reduce((sum, item) => sum + (item.badge ?? 0), 0);
    return total > 0 ? total : undefined;
  }
</script>

<aside
  class="flex h-screen flex-col overflow-hidden border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] transition-all duration-300 {collapsed
    ? 'w-16'
    : 'w-64'}"
>
  <div class="flex h-14 shrink-0 items-center border-b border-[hsl(var(--sidebar-border))] px-3">
    <a href="/" class="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(var(--primary-hover))] text-[hsl(var(--primary-foreground))] shadow-md"
      >
        <Icon name="cpu" size={20} />
      </div>
      {#if !collapsed}
        <span class="truncate text-lg font-bold tracking-tight text-gradient">RunCanon</span>
      {/if}
    </a>
    {#if !collapsed}
      <button
        type="button"
        onclick={onToggle}
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        aria-label="Collapse sidebar"
        title="Collapse sidebar"
      >
        <Icon name="chevronLeft" size={16} />
      </button>
    {/if}
  </div>

  <nav class="flex-1 space-y-1 overflow-y-auto px-2 py-3">
    {#if collapsed}
      {#each flatLinks as item}
        <a
          href={item.href}
          class="group flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors {isNavActive(
            item.href,
            $page.url.pathname
          )
            ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}"
          title={item.label}
        >
          <Icon
            name={item.icon}
            size={20}
            class={isNavActive(item.href, $page.url.pathname) ? "text-[hsl(var(--primary))]" : ""}
          />
        </a>
      {/each}
    {:else}
      {#each topLinks as item}
        <a
          href={item.href}
          class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors {isNavActive(
            item.href,
            $page.url.pathname
          )
            ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
            : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}"
        >
          <Icon
            name={item.icon}
            size={20}
            class={isNavActive(item.href, $page.url.pathname) ? "text-[hsl(var(--primary))]" : ""}
          />
          <span class="flex-1 whitespace-nowrap">{item.label}</span>
        </a>
      {/each}

      {#each navGroups as group}
        {@const open = isGroupOpen(group.id)}
        {@const activeInGroup = groupHasActiveItem(group, $page.url.pathname)}
        {@const badge = groupBadge(group)}
        <div class="pt-1">
          <button
            type="button"
            onclick={() => toggleGroup(group.id)}
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors {activeInGroup
              ? 'text-[hsl(var(--primary))]'
              : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}"
            aria-expanded={open}
          >
            <Icon
              name="chevronRight"
              size={14}
              class="shrink-0 transition-transform {open ? 'rotate-90' : ''}"
            />
            <span class="flex-1 truncate">{group.label}</span>
            {#if badge}
              <span
                class="rounded-full bg-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-[hsl(var(--primary))]"
              >
                {badge}
              </span>
            {/if}
          </button>

          {#if open}
            <div class="ml-2 space-y-0.5 border-l border-[hsl(var(--border))] pl-2">
              {#each group.items as item}
                <a
                  href={item.href}
                  class="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors {isNavActive(
                    item.href,
                    $page.url.pathname
                  )
                    ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]'
                    : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'}"
                >
                  <Icon
                    name={item.icon}
                    size={18}
                    class={isNavActive(item.href, $page.url.pathname) ? "text-[hsl(var(--primary))]" : ""}
                  />
                  <span class="flex-1 whitespace-nowrap">{item.label}</span>
                  {#if item.badge}
                    <span
                      class="rounded-full bg-[hsl(var(--primary))]/15 px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary))]"
                    >
                      {item.badge}
                    </span>
                  {/if}
                </a>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </nav>

  <div class="shrink-0 border-t border-[hsl(var(--sidebar-border))] px-2 py-3">
    <div class="flex items-center {collapsed ? 'justify-center' : 'gap-2 px-2'}">
      <span class="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--success))]" title="Connected"></span>
      {#if !collapsed}
        <div class="min-w-0 flex-1">
          <p class="truncate text-xs font-medium">{layout?.workspaceName ?? layout?.projectName ?? "Workspace"}</p>
          {#if layout?.user?.email}
            <p class="truncate text-[10px] text-[hsl(var(--muted-foreground))]">{layout.user.email}</p>
          {/if}
          <p class="truncate text-[10px] capitalize text-[hsl(var(--muted-foreground))]">Autonomy: {autonomyText}</p>
        </div>
      {/if}
      <button
        type="button"
        onclick={onToggle}
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
      </button>
    </div>
  </div>
</aside>
