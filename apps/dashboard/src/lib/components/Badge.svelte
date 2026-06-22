<script lang="ts">
  export interface Props {
    variant?: "default" | "success" | "warning" | "danger" | "info" | "muted";
    class?: string;
    children: import("svelte").Snippet;
  }

  let { variant = "default", class: className = "", children }: Props = $props();

  const variantClasses = {
    default: "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border-[hsl(var(--primary))]/20",
    success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/20",
    warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/20",
    danger: "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))] border-[hsl(var(--destructive))]/20",
    info: "bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400",
    muted: "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]",
  };
</script>

<span class="badge {variantClasses[variant]} {className}">
  {@render children()}
</span>
