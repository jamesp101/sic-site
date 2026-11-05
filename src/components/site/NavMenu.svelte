<script lang="ts">
  import { ChevronDown, Menu, X } from '@lucide/svelte';
  import type { NavItem } from '@/lib/site-nav';

  let { items, currentPath }: { items: NavItem[]; currentPath: string } = $props();

  let menuOpen = $state(false);
  let openGroup = $state<string | null>(null);
  let root: HTMLElement | undefined = $state();

  const isCurrent = (href?: string) => href !== undefined && href === currentPath;
  const groupCurrent = (children?: { href: string }[]) => children?.some((child) => isCurrent(child.href)) ?? false;

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

  // composedPath() is fixed at dispatch time: the toggle swaps its icon on click, so `event.target` may already be detached.
  function onWindowClick(event: MouseEvent) {
    if (root && !event.composedPath().includes(root)) closeAll();
  }

  const desktop = () => matchMedia('(min-width: 768px)').matches;

  function onHover(event: PointerEvent, label: string, open: boolean) {
    if (event.pointerType !== 'mouse' || !desktop()) return;
    if (open) openGroup = label;
    else if (openGroup === label) openGroup = null;
  }

  function onFocusOut(event: FocusEvent, label: string) {
    const group = event.currentTarget as HTMLElement;
    if (openGroup === label && !(event.relatedTarget instanceof Node && group.contains(event.relatedTarget))) {
      openGroup = null;
    }
  }

  // Active item: gold text plus a bar (left edge in the phone menu, underline from md up), so colour is never the only cue.
  const marker =
    "relative after:pointer-events-none after:absolute after:inset-y-2 after:left-0 after:w-1 after:rounded-full after:bg-gold-400 after:opacity-0 after:transition-opacity after:duration-200 md:after:inset-y-auto md:after:bottom-1 md:after:left-3 md:after:right-3 md:after:h-0.5 md:after:w-auto";
  const itemBase =
    'min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors duration-200 ease-out hover:text-gold-300 md:min-h-10';
  const link = `${marker} ${itemBase} flex aria-[current=page]:bg-white/10 aria-[current=page]:text-gold-300 aria-[current=page]:after:opacity-100 md:aria-[current=page]:bg-transparent`;
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />

<nav bind:this={root} aria-label="Primary" class="flex items-center">
  <button
    type="button"
    data-menu-toggle
    class="nav-toggle inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 text-white transition-colors duration-200 hover:bg-white/10 md:hidden"
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
    class="nav-list absolute inset-x-0 top-full max-h-[calc(100dvh-4.5rem)] flex-col gap-1 overflow-y-auto border-t border-white/10 bg-brand-800 px-6 py-4 shadow-brand-lg md:static md:flex md:max-h-none md:flex-row md:items-center md:gap-1 md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none {menuOpen
      ? 'flex'
      : 'hidden'}"
  >
    {#each items as item (item.label)}
      <li
        class="nav-group relative"
        onpointerenter={(event) => onHover(event, item.label, true)}
        onpointerleave={(event) => onHover(event, item.label, false)}
        onfocusout={(event) => onFocusOut(event, item.label)}
      >
        {#if item.children?.length}
          <button
            type="button"
            data-group={item.label}
            class="{marker} {itemBase} flex w-full justify-between gap-1 data-[active]:text-gold-300 data-[active]:after:opacity-100 md:w-auto"
            data-active={groupCurrent(item.children) ? '' : undefined}
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
            class="nav-sub mt-1 flex-col gap-0.5 border-l border-white/15 pl-3 md:absolute md:left-0 md:top-full md:z-50 md:mt-0 md:w-72 md:rounded-xl md:border md:border-white/10 md:bg-brand-800 md:p-2 md:shadow-brand-lg {openGroup ===
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
