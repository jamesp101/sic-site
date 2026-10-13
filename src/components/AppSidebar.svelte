<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';
  import Download from '@lucide/svelte/icons/download';
  import Home from '@lucide/svelte/icons/house';
  import Image from '@lucide/svelte/icons/image';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import Link2 from '@lucide/svelte/icons/link-2';
  import School from '@lucide/svelte/icons/school';
  import SettingsIcon from '@lucide/svelte/icons/settings';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import Network from '@lucide/svelte/icons/network';
  import UsersIcon from '@lucide/svelte/icons/users';
  import { onMount } from 'svelte';
  import AppLogo from '@/components/AppLogo.svelte';
  import NavMain from '@/components/NavMain.svelte';
  import NavUser from '@/components/NavUser.svelte';
  import ScopeSwitcher from '@/components/admin/ScopeSwitcher.svelte';
  import type { AdminUser, NavItem, ScopeOption, ScopeSummary } from '@/components/admin/types';
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
  } from '@/components/ui/sidebar';

  let {
    user,
    currentPath,
    scope,
    scopeDepartments,
    scopeLocked,
  }: {
    user: AdminUser;
    currentPath: string;
    scope: ScopeSummary;
    scopeDepartments: ScopeOption[];
    scopeLocked: boolean;
  } = $props();

  const { isMobile, setOpenMobile } = useSidebar();
  let openSignal = $state(0);

  // Page-level "change" links ask the switcher to open (on mobile the sheet opens first).
  onMount(() => {
    const request = () => {
      if ($isMobile) setOpenMobile(true);
      openSignal += 1;
    };
    window.addEventListener('admin:open-scope', request);
    return () => window.removeEventListener('admin:open-scope', request);
  });

  const mainNavItems = $derived<NavItem[]>([
    { title: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
    { title: 'Posts', href: '/admin/posts', icon: FileText },
    { title: 'Downloads', href: '/admin/downloads', icon: Download },
    { title: 'Hero Sections', href: '/admin/hero-sections', icon: Sparkles },
    { title: 'Departments', href: '/admin/departments', icon: School },
    ...(scope.kind === 'department'
      ? [{ title: 'Org chart', href: `/admin/departments/${scope.id}/members`, icon: Network }]
      : []),
    { title: 'Carousels', href: '/admin/carousels', icon: Image },
    ...(user.role === 'superadmin'
      ? [
          { title: 'Navigation Links', href: '/admin/navlinks', icon: Link2 },
          { title: 'Users', href: '/admin/users', icon: UsersIcon },
          { title: 'Landing Settings', href: '/admin/settings/landing', icon: SettingsIcon },
        ]
      : []),
    { title: 'View Site', href: '/', icon: Home },
  ]);
</script>

<Sidebar collapsible="icon" variant="inset">
  <SidebarHeader>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          {#snippet children(props)}
            <a {...props} href="/dashboard" class={props.class}>
              <AppLogo />
            </a>
          {/snippet}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
    <ScopeSwitcher {scope} departments={scopeDepartments} locked={scopeLocked} {openSignal} />
  </SidebarHeader>

  <SidebarContent>
    <NavMain items={mainNavItems} {currentPath} />
  </SidebarContent>

  <SidebarFooter>
    <NavUser {user} />
  </SidebarFooter>
</Sidebar>
