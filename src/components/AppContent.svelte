<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SidebarInset } from '@/components/ui/sidebar';

  let {
    class: className = '',
    children,
  }: {
    class?: string;
    children?: Snippet;
  } = $props();
</script>

<SidebarInset class={className}>
  {@render children?.()}
</SidebarInset>
