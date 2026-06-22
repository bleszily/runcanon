<script lang="ts">
  interface Props {
    source: string;
    empty?: string;
  }

  let { source, empty = "No content provided." }: Props = $props();

  function simpleMarkdown(md: string): string {
    if (!md) return empty;
    return md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/^###### (.*$)/gim, '<h6 class="text-sm font-semibold mt-4 mb-1">$1</h6>')
      .replace(/^##### (.*$)/gim, '<h5 class="text-sm font-semibold mt-4 mb-1">$1</h5>')
      .replace(/^#### (.*$)/gim, '<h4 class="text-base font-semibold mt-4 mb-1">$1</h4>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-5 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>')
      .replace(/`([^`]+)`/g, '<code class="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-xs font-mono">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/^\s*-\s+(.*$)/gim, '<li class="ml-4 list-disc">$1</li>')
      .replace(/\n/g, "<br />");
  }
</script>

<article class="prose prose-sm max-w-none text-[hsl(var(--foreground))]">
  {@html simpleMarkdown(source)}
</article>
