<script lang="ts">
  import { icons, type IconName } from "$lib/icons";

  interface Props {
    name: IconName;
    size?: number | string;
    class?: string;
    strokeWidth?: number;
  }

  let { name, size = 20, class: className = "", strokeWidth = 2 }: Props = $props();

  const path = $derived(icons[name] ?? "");
  const sizeValue = $derived(typeof size === "number" ? `${size}px` : size);
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={sizeValue}
  height={sizeValue}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
>
  <path d={path} />
</svg>
