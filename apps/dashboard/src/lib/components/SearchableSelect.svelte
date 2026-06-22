<script lang="ts">
  import { tick } from "svelte";

  export interface SearchableSelectOption {
    value: string;
    label: string;
    keywords?: string;
  }

  interface Props {
    options: SearchableSelectOption[];
    value?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    required?: boolean;
    disabled?: boolean;
    id?: string;
  }

  let {
    options,
    value = $bindable(""),
    placeholder = "Select…",
    searchPlaceholder = "Search by name…",
    required = false,
    disabled = false,
    id,
  }: Props = $props();

  let open = $state(false);
  let query = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);
  let listId = $derived(id ? `${id}-list` : "searchable-select-list");

  const selected = $derived(options.find((option) => option.value === value));

  const filtered = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = `${option.label} ${option.value} ${option.keywords ?? ""}`.toLowerCase();
      return haystack.includes(needle);
    });
  });

  $effect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && rootEl?.contains(target)) return;
      open = false;
      query = selected?.label ?? "";
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  async function openPicker() {
    if (disabled) return;
    open = true;
    query = selected?.label ?? "";
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function selectOption(option: SearchableSelectOption) {
    value = option.value;
    query = option.label;
    open = false;
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      open = false;
      query = selected?.label ?? "";
      return;
    }
    if (event.key === "Enter" && filtered.length === 1) {
      event.preventDefault();
      selectOption(filtered[0]!);
    }
  }
</script>

<div class="relative" bind:this={rootEl}>
  {#if open}
    <input
      bind:this={inputEl}
      {id}
      type="text"
      class="w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2"
      placeholder={searchPlaceholder}
      bind:value={query}
      {required}
      {disabled}
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      onkeydown={onInputKeydown}
    />
    <ul
      id={listId}
      role="listbox"
      class="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-1 shadow-lg"
    >
      {#each filtered as option (option.value)}
        <li role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={option.value === value}
            class="w-full px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]/60 {option.value === value
              ? 'bg-[hsl(var(--muted))]/40'
              : ''}"
            onclick={() => selectOption(option)}
          >
            {option.label}
          </button>
        </li>
      {:else}
        <li class="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">No matches</li>
      {/each}
    </ul>
  {:else}
    <button
      type="button"
      {id}
      class="flex w-full items-center justify-between rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-left text-sm disabled:opacity-50"
      {disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      onclick={openPicker}
    >
      <span class={selected ? "" : "text-[hsl(var(--muted-foreground))]"}>
        {selected?.label ?? placeholder}
      </span>
      <span class="text-[hsl(var(--muted-foreground))]">▾</span>
    </button>
    {#if required}
      <input type="text" class="sr-only" tabindex="-1" {required} value={value} />
    {/if}
  {/if}
</div>
