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

<a
  href="#main"
  class="sr-only z-100 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-brand-950 focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
>
  Skip to main content
</a>
<AppShell {sidebarOpen}>
  <AppSidebar {user} {currentPath} {scope} {scopeDepartments} {scopeLocked} />
  <AppContent class="overflow-x-hidden">
    <AppSidebarHeader {breadcrumbs} />
    <main id="main" tabindex="-1" class="flex flex-1 flex-col outline-none">
      {@render children?.()}
    </main>
  </AppContent>
  <Toaster />
</AppShell>
