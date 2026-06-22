<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import Icon from "./Icon.svelte";
  import { toasts } from "$lib/stores/toasts";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();
  let query = $state("");

  const commands = [
    { id: "overview", label: "Go to Overview", href: "/", icon: "home" as const },
    { id: "skills", label: "Go to Skills", href: "/skills", icon: "skills" as const },
    { id: "proposals", label: "Go to Proposals", href: "/proposals", icon: "proposals" as const },
    { id: "trajectories", label: "Go to Trajectories", href: "/trajectories", icon: "trajectories" as const },
    { id: "autonomy", label: "Go to Autonomy", href: "/autonomy", icon: "autonomy" as const },
    { id: "settings", label: "Go to Settings", href: "/settings", icon: "settings" as const },
    { id: "mine", label: "Run skill mining", action: "mine" as const, icon: "cpu" as const },
    { id: "export", label: "Export skills to harnesses", action: "export" as const, icon: "package" as const },
  ];

  const filtered = $derived(
    commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  );

  async function run(command: (typeof commands)[number]) {
    onClose();
    if ("href" in command && command.href) {
      await goto(command.href);
      return;
    }
    if (command.action === "mine") {
      try {
        const res = await fetch("/api/mine", { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { proposals: unknown[] };
        toasts.success(`Mining complete - ${body.proposals.length} proposal(s)`);
        await invalidateAll();
        await goto("/proposals");
      } catch (error) {
        toasts.error(error instanceof Error ? error.message : "Mining failed");
      }
      return;
    }
    if (command.action === "export") {
      try {
        const res = await fetch("/api/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ harness: "all" }),
        });
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { filesWritten: number; skillCount: number };
        toasts.success(`Exported ${body.skillCount} skill(s) - ${body.filesWritten} file(s) written`);
      } catch (error) {
        toasts.error(error instanceof Error ? error.message : "Export failed");
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
</script>

{#if open}
  <div class="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[15vh]" role="presentation" onclick={onClose}>
    <div
      class="w-full max-w-lg rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
    >
      <div class="flex items-center gap-3 border-b border-[hsl(var(--border))] px-4 py-3">
        <Icon name="search" size={18} />
        <input
          class="input flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          placeholder="Type a command or search…"
          bind:value={query}
          autofocus
        />
        <kbd class="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-xs">Esc</kbd>
      </div>
      <ul class="max-h-72 overflow-y-auto p-2">
        {#each filtered as cmd (cmd.id)}
          <li>
            <button
              class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-[hsl(var(--muted))]"
              onclick={() => run(cmd)}
            >
              <Icon name={cmd.icon} size={16} />
              {cmd.label}
            </button>
          </li>
        {:else}
          <li class="px-3 py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">No commands found</li>
        {/each}
      </ul>
    </div>
  </div>
{/if}
