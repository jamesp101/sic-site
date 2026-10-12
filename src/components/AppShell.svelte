<script lang="ts">
  import type { Snippet } from 'svelte';
  import { SidebarProvider } from '@/components/ui/sidebar';

  let {
    sidebarOpen = true,
    children,
  }: {
    sidebarOpen?: boolean;
    children?: Snippet;
  } = $props();
</script>

<SidebarProvider defaultOpen={sidebarOpen}>
  {@render children?.()}
</SidebarProvider>
