<script lang="ts">
  import "../app.css";
  import Shell from "$lib/components/Shell.svelte";
  import Toasts from "$lib/components/Toasts.svelte";

  let { children } = $props();
</script>

<Shell>
  {@render children()}
</Shell>
<Toasts />
