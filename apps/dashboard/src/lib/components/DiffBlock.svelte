<script lang="ts">
  interface Props {
    before?: string;
    after?: string;
    beforeLabel?: string;
    afterLabel?: string;
  }

  let {
    before,
    after,
    beforeLabel = "Before",
    afterLabel = "After",
  }: Props = $props();
</script>

<div class="diff-block overflow-hidden rounded-xl border border-[hsl(var(--border))]">
  <div class="diff-headrow grid grid-cols-2 font-mono text-[11px] uppercase tracking-wider">
    <div class="border-b border-r border-[hsl(var(--border))] px-4 py-2 text-[hsl(var(--destructive))]">{beforeLabel}</div>
    <div class="border-b border-[hsl(var(--border))] px-4 py-2 text-[hsl(var(--primary))]">{afterLabel}</div>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-2">
    <div class="diff-cell-minus border-b border-[hsl(var(--border))] p-4 font-mono text-sm md:border-b-0 md:border-r">
      {#if before}
        <pre class="whitespace-pre-wrap break-words">{before}</pre>
      {:else}
        <span class="text-[hsl(var(--muted-foreground))] italic">No previous version</span>
      {/if}
    </div>
    <div class="diff-cell-plus p-4 font-mono text-sm">
      {#if after}
        <pre class="whitespace-pre-wrap break-words">{after}</pre>
      {:else}
        <span class="text-[hsl(var(--muted-foreground))] italic">No changes</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .diff-cell-minus {
    background: hsl(var(--uc-brand-primary-dark));
    color: hsl(var(--uc-brand-critical-soft));
  }
  .diff-cell-plus {
    background: hsl(var(--uc-brand-navy));
    color: hsl(var(--uc-brand-blue-hover));
  }
</style>
