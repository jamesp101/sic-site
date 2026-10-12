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
  import UsersIcon from '@lucide/svelte/icons/users';
  import AppLogo from '@/components/AppLogo.svelte';
  import NavMain from '@/components/NavMain.svelte';
  import NavUser from '@/components/NavUser.svelte';
  import type { AdminUser, NavItem } from '@/components/admin/types';
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
  } from '@/components/ui/sidebar';

  let {
    user,
    currentPath,
  }: {
    user: AdminUser;
    currentPath: string;
  } = $props();

  const mainNavItems: NavItem[] = [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
    { title: 'Posts', href: '/admin/posts', icon: FileText },
    { title: 'Downloads', href: '/admin/downloads', icon: Download },
    { title: 'Hero Sections', href: '/admin/hero-sections', icon: Sparkles },
    { title: 'Departments', href: '/admin/departments', icon: School },
    { title: 'Carousels', href: '/admin/carousels', icon: Image },
    ...(user.role === 'superadmin'
      ? [
          { title: 'Navigation Links', href: '/admin/navlinks', icon: Link2 },
          { title: 'Users', href: '/admin/users', icon: UsersIcon },
          { title: 'Landing Settings', href: '/admin/settings/landing', icon: SettingsIcon },
        ]
      : []),
    { title: 'View Site', href: '/', icon: Home },
  ];
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
  </SidebarHeader>

  <SidebarContent>
    <NavMain items={mainNavItems} {currentPath} />
  </SidebarContent>

  <SidebarFooter>
    <NavUser {user} />
  </SidebarFooter>
</Sidebar>
