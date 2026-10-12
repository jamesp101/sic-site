<script lang="ts">
  import { ChevronDown, Menu, X } from '@lucide/svelte';
  import type { NavItem } from './nav-types';

  let { items, currentPath }: { items: NavItem[]; currentPath: string } = $props();

  let menuOpen = $state(false);
  let openGroup = $state<string | null>(null);
  let root: HTMLElement | undefined = $state();

  const isCurrent = (href?: string) => href !== undefined && href === currentPath;

  function closeAll() {
    menuOpen = false;
    openGroup = null;
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || (!menuOpen && openGroup === null)) return;
    const focusButton = openGroup !== null;
    const trigger = root?.querySelector<HTMLElement>(
      focusButton ? `[data-group="${CSS.escape(openGroup ?? '')}"]` : '[data-menu-toggle]',
    );
    closeAll();
    trigger?.focus();
  }

  function onWindowClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) closeAll();
  }

  const link =
    'block rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:text-gold-300 aria-[current=page]:text-gold-300';
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />

<nav bind:this={root} aria-label="Primary" class="flex items-center">
  <button
    type="button"
    data-menu-toggle
    class="nav-toggle inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 text-white hover:bg-white/10 md:hidden"
    aria-expanded={menuOpen}
    aria-controls="primary-menu"
    aria-label={menuOpen ? 'Close menu' : 'Open menu'}
    onclick={() => (menuOpen = !menuOpen)}
  >
    {#if menuOpen}
      <X class="h-5 w-5" aria-hidden="true" />
    {:else}
      <Menu class="h-5 w-5" aria-hidden="true" />
    {/if}
  </button>

  <ul
    id="primary-menu"
    class="nav-list absolute inset-x-0 top-full flex-col gap-1 border-t border-white/10 bg-brand-800 px-6 py-4 shadow-brand-lg md:static md:flex md:flex-row md:items-center md:gap-1 md:border-0 md:bg-transparent md:p-0 md:shadow-none {menuOpen
      ? 'flex'
      : 'hidden'}"
  >
    {#each items as item (item.label)}
      <li class="nav-group group relative">
        {#if item.children?.length}
          <button
            type="button"
            data-group={item.label}
            class="flex w-full items-center justify-between gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:text-gold-300 md:w-auto"
            aria-expanded={openGroup === item.label}
            aria-controls="submenu-{item.label.replace(/\W+/g, '-').toLowerCase()}"
            onclick={() => (openGroup = openGroup === item.label ? null : item.label)}
          >
            {item.label}
            <ChevronDown
              class="h-4 w-4 transition-transform {openGroup === item.label ? 'rotate-180' : ''}"
              aria-hidden="true"
            />
          </button>
          <ul
            id="submenu-{item.label.replace(/\W+/g, '-').toLowerCase()}"
            class="nav-sub mt-1 flex-col gap-0.5 border-l border-white/15 pl-3 md:absolute md:left-0 md:top-full md:z-50 md:mt-0 md:w-72 md:rounded-xl md:border md:border-white/10 md:bg-brand-800 md:p-2 md:shadow-brand-lg md:group-hover:flex {openGroup ===
            item.label
              ? 'flex'
              : 'hidden'}"
          >
            {#each item.children as child (child.href + child.label)}
              <li>
                <a
                  href={child.href}
                  class="{link} md:hover:bg-white/10"
                  aria-current={isCurrent(child.href) ? 'page' : undefined}
                  onclick={closeAll}>{child.label}</a
                >
              </li>
            {/each}
          </ul>
        {:else}
          <a
            href={item.href}
            class={link}
            aria-current={isCurrent(item.href) ? 'page' : undefined}
            onclick={closeAll}>{item.label}</a
          >
        {/if}
      </li>
    {/each}
  </ul>
</nav>
