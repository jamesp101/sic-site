<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { toast } from 'svelte-sonner';
  import AppContent from '@/components/AppContent.svelte';
  import AppShell from '@/components/AppShell.svelte';
  import AppSidebar from '@/components/AppSidebar.svelte';
  import AppSidebarHeader from '@/components/AppSidebarHeader.svelte';
  import { Toaster } from '@/components/ui/sonner';
  import type { AdminUser, BreadcrumbItem, ScopeOption, ScopeSummary } from './types';

  let {
    user,
    currentPath,
    breadcrumbs = [],
    sidebarOpen = true,
    scope,
    scopeDepartments,
    scopeLocked,
    flash = null,
    children,
  }: {
    user: AdminUser;
    currentPath: string;
    breadcrumbs?: BreadcrumbItem[];
    sidebarOpen?: boolean;
    scope: ScopeSummary;
    scopeDepartments: ScopeOption[];
    scopeLocked: boolean;
    flash?: { type: 'success' | 'error'; message: string } | null;
    children?: Snippet;
  } = $props();

  onMount(() => {
    if (flash) toast[flash.type](flash.message);
  });
</script>

<AppShell {sidebarOpen}>
  <AppSidebar {user} {currentPath} {scope} {scopeDepartments} {scopeLocked} />
  <AppContent class="overflow-x-hidden">
    <AppSidebarHeader {breadcrumbs} />
    {@render children?.()}
  </AppContent>
  <Toaster />
</AppShell>
