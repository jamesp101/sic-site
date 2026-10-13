<script lang="ts">
  import { ArrowDown, ArrowUp, ChevronsLeft, ChevronsRight, CornerDownRight, Ellipsis, Trash } from '@lucide/svelte';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';

  let {
    label,
    isChild,
    busy,
    canUp,
    canDown,
    canNest,
    canUnnest,
    nestHint,
    onup,
    ondown,
    onnest,
    onunnest,
    onaddchild,
    ondelete,
  }: {
    label: string;
    isChild: boolean;
    busy: boolean;
    canUp: boolean;
    canDown: boolean;
    canNest: boolean;
    canUnnest: boolean;
    /** Why “Make sub-link” is unavailable, shown as a tooltip. */
    nestHint: string;
    onup: () => void;
    ondown: () => void;
    onnest: () => void;
    onunnest: () => void;
    onaddchild: () => void;
    ondelete: () => void;
  } = $props();

  let open = $state(false);
  let trigger = $state<HTMLElement | null>(null);

  const itemClass = 'gap-2 disabled:pointer-events-none disabled:opacity-50 focus-visible:bg-accent focus-visible:text-accent-foreground';

  const enabledItems = (menu: HTMLElement) =>
    [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].filter((el) => !(el as HTMLButtonElement).disabled);

  function focusFirst(menu: HTMLElement) {
    enabledItems(menu)[0]?.focus();
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const menu = event.currentTarget as HTMLElement;
    const items = enabledItems(menu);
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        // The menu content closes itself on Escape; hand focus back to the trigger.
        trigger?.focus();
        return;
      case 'Tab':
        open = false;
        return;
      default:
        return;
    }
    event.preventDefault();
    if (items.length > 0 && next !== null) items[next].focus();
  }
</script>

<DropdownMenu bind:open class="inline-block">
  <DropdownMenuTrigger asChild>
    {#snippet children(props)}
      <button
        type="button"
        bind:this={trigger}
        {...props}
        aria-haspopup="menu"
        aria-label={`More actions for ${label}`}
        title="More actions"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground aria-expanded:bg-surface-alt aria-expanded:text-foreground"
      >
        <Ellipsis class="h-4 w-4" aria-hidden="true" />
      </button>
    {/snippet}
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" sideOffset={4} class="w-72 p-1">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div role="none" onkeydown={onMenuKeydown} {@attach focusFirst}>
      <DropdownMenuItem asChild class={itemClass}>
        {#snippet children(item)}
          <button type="button" role="menuitem" class={item.class} disabled={busy || !canUp} onclick={() => { item.onClick?.(); onup(); }}>
            <ArrowUp class="h-4 w-4" aria-hidden="true" /> Move up
          </button>
        {/snippet}
      </DropdownMenuItem>
      <DropdownMenuItem asChild class={itemClass}>
        {#snippet children(item)}
          <button type="button" role="menuitem" class={item.class} disabled={busy || !canDown} onclick={() => { item.onClick?.(); ondown(); }}>
            <ArrowDown class="h-4 w-4" aria-hidden="true" /> Move down
          </button>
        {/snippet}
      </DropdownMenuItem>
      {#if isChild}
        <DropdownMenuItem asChild class={itemClass}>
          {#snippet children(item)}
            <button type="button" role="menuitem" class={item.class} disabled={busy || !canUnnest} onclick={() => { item.onClick?.(); onunnest(); }}>
              <ChevronsLeft class="h-4 w-4" aria-hidden="true" /> Make top-level
            </button>
          {/snippet}
        </DropdownMenuItem>
      {:else}
        <DropdownMenuItem asChild class={itemClass}>
          {#snippet children(item)}
            <button
              type="button"
              role="menuitem"
              class={item.class}
              disabled={busy || !canNest}
              title={canNest ? undefined : nestHint}
              onclick={() => { item.onClick?.(); onnest(); }}
            >
              <ChevronsRight class="h-4 w-4" aria-hidden="true" /> Make sub-link of the link above
            </button>
          {/snippet}
        </DropdownMenuItem>
        <DropdownMenuItem asChild class={itemClass}>
          {#snippet children(item)}
            <button type="button" role="menuitem" class={item.class} onclick={() => { item.onClick?.(); onaddchild(); }}>
              <CornerDownRight class="h-4 w-4" aria-hidden="true" /> Add sub-link
            </button>
          {/snippet}
        </DropdownMenuItem>
      {/if}
      <div role="separator" class="my-1 h-px bg-border"></div>
      <DropdownMenuItem asChild class={`${itemClass} text-destructive hover:bg-destructive/10 hover:text-destructive`}>
        {#snippet children(item)}
          <button type="button" role="menuitem" class={item.class} onclick={() => { item.onClick?.(); ondelete(); }}>
            <Trash class="h-4 w-4" aria-hidden="true" /> Delete
          </button>
        {/snippet}
      </DropdownMenuItem>
    </div>
  </DropdownMenuContent>
</DropdownMenu>
