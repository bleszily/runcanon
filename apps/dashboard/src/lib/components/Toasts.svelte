<script lang="ts">
  import Icon from "./Icon.svelte";
  import { toasts } from "$lib/stores/toasts";

  const variantClass = (variant: string) => {
    switch (variant) {
      case "success":
        return "border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]";
      case "error":
        return "border-[hsl(var(--destructive))]/40 bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]";
      case "warning":
        return "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]";
      default:
        return "border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]";
    }
  };
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
  {#each $toasts as toast (toast.id)}
    <div
      class="pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm {variantClass(toast.variant)}"
      role="status"
    >
      <p class="flex-1 text-sm font-medium">{toast.message}</p>
      <button class="opacity-70 hover:opacity-100" onclick={() => toasts.dismiss(toast.id)} aria-label="Dismiss">
        <Icon name="x" size={16} />
      </button>
    </div>
  {/each}
</div>
