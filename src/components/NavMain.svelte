<script lang="ts">
  import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
  } from '@/components/ui/sidebar';
  import type { NavItem } from '@/components/admin/types';

  let {
    items = [],
    currentPath,
  }: {
    items: NavItem[];
    currentPath: string;
  } = $props();

  function isActive(href: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath.startsWith(`${href}/`);
  }
</script>

<SidebarGroup class="px-2 py-0">
  <SidebarGroupLabel>Platform</SidebarGroupLabel>
  <SidebarMenu>
    {#each items as item (item.href)}
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive(item.href)} tooltip={item.title}>
          {#snippet children(props)}
            <a {...props} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined} class={props.class}>
              {#if item.icon}
                <item.icon class="size-4 shrink-0" />
              {/if}
              <span>{item.title}</span>
            </a>
          {/snippet}
        </SidebarMenuButton>
      </SidebarMenuItem>
    {/each}
  </SidebarMenu>
</SidebarGroup>
