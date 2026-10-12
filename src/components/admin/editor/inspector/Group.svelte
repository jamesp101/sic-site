<script lang="ts">
  import type { Snippet } from 'svelte';

  let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div class="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
  <h4 class="text-xs font-bold tracking-wide text-muted-foreground uppercase">{title}</h4>
  {@render children()}
</div>
