<script lang="ts">
  import Icon from "./Icon.svelte";
  import Badge from "./Badge.svelte";
  import SkillDrawer from "./SkillDrawer.svelte";
  import type { Skill, HarnessType } from "$lib/types";

  interface Props {
    skills: Skill[];
    loading?: boolean;
  }

  let { skills, loading = false }: Props = $props();

  let view = $state<"grid" | "list">("grid");
  let query = $state("");
  let statusFilter = $state<"all" | Skill["status"]>("active");
  let harnessFilter = $state<"all" | HarnessType>("all");
  let tagFilter = $state("");
  let selectedSkill = $state<Skill | null>(null);

  const allTags = $derived([...new Set(skills.flatMap((s) => s.tags))].sort());

  const filtered = $derived(
    skills.filter((skill) => {
      const matchesQuery =
        query === "" ||
        skill.name.toLowerCase().includes(query.toLowerCase()) ||
        skill.description.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = statusFilter === "all" || skill.status === statusFilter;
      const matchesHarness = harnessFilter === "all" || skill.harnesses.some((h) => h.type === harnessFilter);
      const matchesTag = tagFilter === "" || skill.tags.includes(tagFilter);
      return matchesQuery && matchesStatus && matchesHarness && matchesTag;
    })
  );

  const statusVariant = (status: Skill["status"]) => {
    switch (status) {
      case "active":
        return "success";
      case "proposed":
        return "warning";
      case "retired":
        return "danger";
      case "deprecated":
        return "muted";
      default:
        return "default";
    }
  };

  const harnessOptions: { value: HarnessType; label: string }[] = [
    { value: "api", label: "API" },
    { value: "browser", label: "Browser" },
    { value: "cli", label: "CLI" },
    { value: "memory", label: "Memory" },
    { value: "code", label: "Code" },
  ];
</script>

<div class="space-y-4">
  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div class="flex flex-1 flex-col gap-3 sm:flex-row">
      <div class="relative flex-1">
        <Icon
          name="search"
          size={18}
          class="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
        />
        <input
          type="text"
          placeholder="Search skills..."
          bind:value={query}
          class="input pl-10"
        />
      </div>

      <select bind:value={statusFilter} class="input w-full sm:w-40">
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="proposed">Proposed</option>
        <option value="retired">Retired</option>
        <option value="deprecated">Deprecated</option>
      </select>

      <select bind:value={harnessFilter} class="input w-full sm:w-40">
        <option value="all">All harnesses</option>
        {#each harnessOptions as opt}
          <option value={opt.value}>{opt.label}</option>
        {/each}
      </select>

      <select bind:value={tagFilter} class="input w-full sm:w-40">
        <option value="">All tags</option>
        {#each allTags as tag}
          <option value={tag}>#{tag}</option>
        {/each}
      </select>
    </div>

    <div class="flex items-center gap-1 rounded-lg border border-[hsl(var(--border))] p-1">
      <button
        class="btn h-8 w-8 p-0 {view === 'grid' ? 'btn-secondary' : 'btn-ghost'}"
        onclick={() => (view = "grid")}
        aria-label="Grid view"
      >
        <Icon name="grid" size={18} />
      </button>
      <button
        class="btn h-8 w-8 p-0 {view === 'list' ? 'btn-secondary' : 'btn-ghost'}"
        onclick={() => (view = "list")}
        aria-label="List view"
      >
        <Icon name="list" size={18} />
      </button>
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _, i}
        <div class="card h-48 p-5">
          <div class="skeleton mb-3 h-6 w-3/4"></div>
          <div class="skeleton mb-2 h-4 w-full"></div>
          <div class="skeleton h-4 w-2/3"></div>
        </div>
      {/each}
    </div>
  {:else if filtered.length === 0}
    <div class="card flex flex-col items-center justify-center py-16">
      <Icon name="skills" size={48} class="mb-4 text-[hsl(var(--muted-foreground))] opacity-40" />
      <p class="text-[hsl(var(--muted-foreground))]">No skills match your filters.</p>
      <button
        class="btn btn-ghost mt-2 text-sm"
        onclick={() => {
          query = "";
          statusFilter = "all";
          harnessFilter = "all";
          tagFilter = "";
        }}
      >
        Clear filters
      </button>
    </div>
  {:else if view === "grid"}
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {#each filtered as skill}
        <button
          class="card card-hover p-5 text-left"
          onclick={() => (selectedSkill = skill)}
        >
          <div class="mb-3 flex items-start justify-between">
            <h3 class="text-lg font-semibold">{skill.name}</h3>
            <Badge variant={statusVariant(skill.status)}>{skill.status}</Badge>
          </div>
          <p class="mb-4 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{skill.description}</p>
          <div class="mb-4 flex flex-wrap gap-1">
            {#each skill.tags as tag}
              <span class="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs text-[hsl(var(--muted-foreground))]"
                >#{tag}</span
              >
            {/each}
          </div>
          <div class="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))]">
            <div class="flex items-center gap-3">
              <span class="flex items-center gap-1">
                <Icon name="cpu" size={14} />
                {skill.usage.calls30d.toLocaleString()}
              </span>
              <span class="flex items-center gap-1">
                <Icon name="check" size={14} />
                {Math.round(skill.usage.successRate * 100)}%
              </span>
            </div>
            <div class="flex gap-1">
              {#each skill.harnesses.slice(0, 3) as harness}
                <span class="flex h-6 w-6 items-center justify-center rounded-md bg-[hsl(var(--muted))]"
                  title={harness.label}>
                  <Icon name={harness.type} size={14} />
                </span>
              {/each}
            </div>
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 text-left">
          <tr>
            <th class="px-5 py-3 font-medium">Skill</th>
            <th class="px-5 py-3 font-medium">Status</th>
            <th class="px-5 py-3 font-medium">Tags</th>
            <th class="px-5 py-3 font-medium">Usage</th>
            <th class="px-5 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[hsl(var(--border))]">
          {#each filtered as skill}
            <tr class="hover:bg-[hsl(var(--muted))]/30">
              <td class="px-5 py-3">
                <div class="font-medium">{skill.name}</div>
                <div class="text-xs text-[hsl(var(--muted-foreground))]">{skill.description}</div>
              </td>
              <td class="px-5 py-3">
                <Badge variant={statusVariant(skill.status)}>{skill.status}</Badge>
              </td>
              <td class="px-5 py-3">
                <div class="flex flex-wrap gap-1">
                  {#each skill.tags as tag}
                    <span class="rounded-md bg-[hsl(var(--muted))] px-2 py-0.5 text-xs">#{tag}</span>
                  {/each}
                </div>
              </td>
              <td class="px-5 py-3">
                <div class="text-xs">{skill.usage.calls30d.toLocaleString()} calls · {Math.round(skill.usage.successRate * 100)}%</div>
              </td>
              <td class="px-5 py-3 text-right">
                <button class="btn btn-ghost h-7 px-2 text-xs" onclick={() => (selectedSkill = skill)}
                  >View</button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<SkillDrawer skill={selectedSkill} onClose={() => (selectedSkill = null)} />
