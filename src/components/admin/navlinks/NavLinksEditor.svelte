<script lang="ts">
  import { actions } from 'astro:actions';
  import { flip } from 'svelte/animate';
  import { tick, untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import {
    ArrowDown,
    ArrowUp,
    ChevronsLeft,
    ChevronsRight,
    CornerDownRight,
    Eye,
    EyeOff,
    GripVertical,
    Pencil,
    Plus,
    Redo2,
    Trash,
    Undo2,
  } from '@lucide/svelte';
  import { reloadView } from '@/lib/navigation';
  import {
    canIndent,
    canOutdent,
    cloneTree,
    indent,
    isTwoLevel,
    moveDown,
    moveUp,
    outdent,
    renumber,
    samePayload,
    toPayload,
    treeFromPayload,
    type NavNode,
    type ReorderItem,
  } from '@/lib/nav-tree';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { parseActionError, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';
  import NavLinkForm from './NavLinkForm.svelte';
  import NavStructurePreview from './NavStructurePreview.svelte';

  let { links }: { links: NavNode[] } = $props();

  const flipDurationMs = 150;
  const iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

  // `tops` is what the user sees (may hold a drag in progress); `saved` is the last tree the server confirmed.
  let tops = $state<NavNode[]>(untrack(() => cloneTree(links)));
  let saved = $state.raw<NavNode[]>(untrack(() => cloneTree(links)));
  let undoStack = $state.raw<ReorderItem[][]>([]);
  let redoStack = $state.raw<ReorderItem[][]>([]);
  let saving = $state(false);
  let dragDisabled = $state(true);
  let selectedId = $state<number | null>(null);
  let editingId = $state<number | null>(null);
  let adding = $state<'top' | number | null>(null);
  let deleting = $state<NavNode | null>(null);
  let deleteBusy = $state(false);
  let announcement = $state('');
  let snapshot: NavNode[] | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const nextTopOrder = $derived(tops.reduce((max, top) => Math.max(max, top.order), 0) + 1);
  const total = $derived(tops.reduce((sum, top) => sum + 1 + top.children.length, 0));

  function find(id: number): NavNode | null {
    for (const top of tops) {
      if (top.id === id) return top;
      const child = top.children.find((c) => c.id === id);
      if (child) return child;
    }
    return null;
  }

  function plain(tree: NavNode[]): NavNode[] {
    return cloneTree(tree);
  }

  /** Persists `next` immediately; rolls back to the last confirmed tree when the server refuses. */
  async function commit(next: NavNode[], record = true, note = 'Order saved.') {
    const before = saved;
    const payload = toPayload(next);
    if (samePayload(payload, toPayload(before))) {
      tops = cloneTree(before);
      return;
    }
    tops = next;
    saving = true;
    const { error } = await actions.navlinks.reorder({ items: payload });
    saving = false;
    if (error) {
      tops = cloneTree(before);
      toast.error(parseActionError(error).message || 'The order could not be saved.');
      announcement = 'The change could not be saved and was reverted.';
      return;
    }
    if (record) {
      undoStack = [...undoStack, toPayload(before)];
      redoStack = [];
    }
    saved = cloneTree(next);
    toast.success(note);
  }

  // ---- drag and drop (mouse, touch) -------------------------------------------------------------

  function beginDrag() {
    snapshot ??= plain(tops);
  }

  function onTopConsider(event: CustomEvent<DndEvent<NavNode>>) {
    beginDrag();
    tops = event.detail.items;
  }

  function onTopFinalize(event: CustomEvent<DndEvent<NavNode>>) {
    tops = event.detail.items;
    settle();
  }

  function setChildren(topId: number, items: NavNode[]) {
    const top = tops.find((t) => t.id === topId);
    if (top) top.children = items;
  }

  function onChildConsider(topId: number, event: CustomEvent<DndEvent<NavNode>>) {
    beginDrag();
    setChildren(topId, event.detail.items);
  }

  function onChildFinalize(topId: number, event: CustomEvent<DndEvent<NavNode>>) {
    setChildren(topId, event.detail.items);
    settle();
  }

  /** Both zones involved in a drop finalize in the same task; save once afterwards. */
  function settle() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      dragDisabled = true;
      const before = snapshot;
      snapshot = null;
      if (!isTwoLevel(tops)) {
        tops = before ?? cloneTree(saved);
        toast.error('A link that has sub-links cannot become a sub-link itself.');
        return;
      }
      void commit(renumber(plain(tops)));
    }, 0);
  }

  function startDrag(event: Event) {
    event.preventDefault();
    if (!saving && !editingId && adding === null) dragDisabled = false;
  }

  // ---- keyboard / button moves ----------------------------------------------------------------------

  async function apply(id: number, result: NavNode[] | null, message: string) {
    if (!result || saving) return;
    selectedId = id;
    announcement = message;
    await commit(result);
    await tick();
    document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus();
  }

  const up = (id: number) => apply(id, moveUp(tops, id), `${find(id)?.label} moved up.`);
  const down = (id: number) => apply(id, moveDown(tops, id), `${find(id)?.label} moved down.`);
  const nest = (id: number) => apply(id, indent(tops, id), `${find(id)?.label} is now a sub-link.`);
  const unnest = (id: number) => apply(id, outdent(tops, id), `${find(id)?.label} is now a top-level link.`);

  function onHandleKeydown(event: KeyboardEvent, node: NavNode) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const actionByKey: Record<string, (() => unknown) | undefined> = {
      ArrowUp: () => up(node.id),
      ArrowDown: () => down(node.id),
      ArrowRight: () => nest(node.id),
      ArrowLeft: () => unnest(node.id),
      Delete: () => (deleting = node),
      Backspace: () => (deleting = node),
      Escape: () => (selectedId = null),
    };
    const run = actionByKey[event.key];
    if (!run) return;
    event.preventDefault();
    run();
  }

  // ---- undo / redo ----------------------------------------------------------------------------------

  async function travel(from: 'undo' | 'redo') {
    if (saving) return;
    const stack = from === 'undo' ? undoStack : redoStack;
    const target = stack[stack.length - 1];
    if (!target) return;
    const current = toPayload(saved);
    const next = treeFromPayload(saved, target);
    const before = saved;
    const payload = toPayload(next);
    tops = next;
    saving = true;
    const { error } = await actions.navlinks.reorder({ items: payload });
    saving = false;
    if (error) {
      tops = cloneTree(before);
      toast.error(parseActionError(error).message || 'The change could not be applied.');
      return;
    }
    saved = cloneTree(next);
    if (from === 'undo') {
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, current];
    } else {
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, current];
    }
    toast.success(from === 'undo' ? 'Change undone.' : 'Change redone.');
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    event.preventDefault();
    void travel(event.shiftKey ? 'redo' : 'undo');
  }

  // ---- active toggle, delete ---------------------------------------------------------------------

  function patchActive(tree: NavNode[], id: number, isActive: boolean): NavNode[] {
    return tree.map((top) => ({
      ...top,
      isActive: top.id === id ? isActive : top.isActive,
      children: top.children.map((child) => (child.id === id ? { ...child, isActive } : child)),
    }));
  }

  async function toggleActive(node: NavNode) {
    if (saving) return;
    const isActive = !node.isActive;
    const parent = tops.find((top) => top.children.some((child) => child.id === node.id));
    const before = tops;
    const savedBefore = saved;
    tops = patchActive(cloneTree(tops), node.id, isActive);
    saved = patchActive(saved, node.id, isActive);
    saving = true;
    const { error } = await actions.navlinks.update({
      id: node.id,
      label: node.label,
      url: node.url,
      order: node.order,
      isActive,
      parentId: parent?.id ?? null,
    });
    saving = false;
    if (error) {
      tops = before;
      saved = savedBefore;
      toast.error(parseActionError(error).message || 'The link could not be updated.');
      return;
    }
    announcement = `${node.label} is now ${isActive ? 'visible' : 'hidden'}.`;
    toast.success(isActive ? `“${node.label}” is visible.` : `“${node.label}” is hidden.`);
  }

  async function confirmDelete() {
    if (!deleting) return;
    deleteBusy = true;
    const { error } = await actions.navlinks.delete({ id: deleting.id });
    if (error) {
      deleteBusy = false;
      deleting = null;
      toast.error(parseActionError(error).message || 'The link could not be deleted.');
      return;
    }
    await reloadView();
  }

  function parentOf(id: number): NavNode | undefined {
    return tops.find((top) => top.children.some((child) => child.id === id));
  }

  function openAdd(target: 'top' | number) {
    editingId = null;
    adding = target;
  }

  function openEdit(id: number) {
    adding = null;
    editingId = id;
  }

  const dragOptions = (items: NavNode[]) => ({
    items,
    flipDurationMs,
    dragDisabled,
    type: 'nav-link',
    zoneTabIndex: -1,
    zoneItemTabIndex: -1,
    dropTargetStyle: {},
    dropTargetClasses: ['nav-drop-target'],
  });
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet linkRow(node: NavNode, child: boolean)}
  {@const parent = parentOf(node.id)}
  <div class="flex flex-wrap items-center gap-2 p-3" onfocusin={() => (selectedId = node.id)}>
    <button
      type="button"
      data-handle={node.id}
      class="inline-flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
      aria-label={`Reorder ${node.label}. Drag with the pointer, or press arrow keys: up and down to move, right to nest, left to un-nest, Delete to remove.`}
      title="Drag to reorder"
      disabled={saving}
      onmousedowncapture={startDrag}
      ontouchstartcapture={startDrag}
      onkeydown={(event) => onHandleKeydown(event, node)}
    >
      <GripVertical class="h-4 w-4" aria-hidden="true" />
    </button>

    <div class="min-w-0 flex-1">
      <p data-testid="nav-label" class="truncate text-sm font-semibold text-foreground">{node.label}</p>
      <p class="truncate font-mono text-xs text-link">{node.url}</p>
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={node.isActive}
      aria-label={`Visible in navigation: ${node.label}`}
      disabled={saving}
      onclick={() => toggleActive(node)}
      class="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-surface-alt disabled:opacity-60"
    >
      {#if node.isActive}
        <Eye class="h-3.5 w-3.5 text-status-event-fg" aria-hidden="true" /> Visible
      {:else}
        <EyeOff class="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> Hidden
      {/if}
    </button>

    <div class="flex items-center gap-0.5" role="group" aria-label={`Actions for ${node.label}`}>
      <button type="button" class={iconButton} aria-label={`Move ${node.label} up`} title="Move up" disabled={saving} onclick={() => up(node.id)}>
        <ArrowUp class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={iconButton} aria-label={`Move ${node.label} down`} title="Move down" disabled={saving} onclick={() => down(node.id)}>
        <ArrowDown class="h-4 w-4" aria-hidden="true" />
      </button>
      {#if child}
        <button type="button" class={iconButton} aria-label={`Make ${node.label} a top-level link`} title="Make top-level" disabled={saving || !canOutdent(tops, node.id)} onclick={() => unnest(node.id)}>
          <ChevronsLeft class="h-4 w-4" aria-hidden="true" />
        </button>
      {:else}
        <button type="button" class={iconButton} aria-label={`Make ${node.label} a sub-link of the link above`} title={node.children.length > 0 ? 'A link with sub-links cannot become a sub-link' : 'Make sub-link of the link above'} disabled={saving || !canIndent(tops, node.id)} onclick={() => nest(node.id)}>
          <ChevronsRight class="h-4 w-4" aria-hidden="true" />
        </button>
      {/if}
      <button type="button" class={iconButton} aria-label={`Edit ${node.label}`} title="Edit link" onclick={() => openEdit(node.id)}>
        <Pencil class="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        aria-label={`Delete ${node.label}`}
        title="Delete link"
        onclick={() => (deleting = node)}
      >
        <Trash class="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </div>

  {#if editingId === node.id}
    <div class="px-3 pb-3">
      <NavLinkForm
        prefix={`edit-${node.id}`}
        link={{ id: node.id, label: node.label, url: node.url, order: node.order, isActive: node.isActive, parentId: parent?.id ?? null }}
        oncancel={() => (editingId = null)}
      />
    </div>
  {/if}
{/snippet}

<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
  <section aria-labelledby="nav-tree-title" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="nav-tree-title" class="text-sm font-semibold text-foreground">
        {total} {total === 1 ? 'link' : 'links'}
        {#if saving}<span class="ml-2 text-xs font-normal text-muted-foreground" role="status">Saving…</span>{/if}
      </h2>
      <div class="flex items-center gap-2">
        <button type="button" class={secondaryButtonClass} disabled={saving || undoStack.length === 0} onclick={() => travel('undo')} aria-keyshortcuts="Control+Z Meta+Z">
          <Undo2 class="h-4 w-4" aria-hidden="true" /> Undo
        </button>
        <button type="button" class={secondaryButtonClass} disabled={saving || redoStack.length === 0} onclick={() => travel('redo')} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z">
          <Redo2 class="h-4 w-4" aria-hidden="true" /> Redo
        </button>
        <button type="button" class={primaryButtonClass} onclick={() => openAdd('top')}>
          <Plus class="h-4 w-4" aria-hidden="true" /> Add link
        </button>
      </div>
    </div>

    {#if adding === 'top'}
      <NavLinkForm prefix="add-top" nextOrder={nextTopOrder} oncancel={() => (adding = null)} />
    {/if}

    {#if tops.length === 0 && adding !== 'top'}
      <p class="rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center text-sm italic text-muted-foreground">
        No navigation links yet. The public site shows its default menu until you add one.
      </p>
    {/if}

    <ul
      aria-label="Navigation links"
      class="space-y-3"
      use:dndzone={dragOptions(tops)}
      onconsider={onTopConsider}
      onfinalize={onTopFinalize}
    >
      {#each tops as top (top.id)}
        <li
          animate:flip={{ duration: flipDurationMs }}
          data-testid="nav-top"
          data-link-id={top.id}
          class="rounded-xl border bg-card shadow-brand-sm transition-[box-shadow,border-color] motion-reduce:transition-none {selectedId === top.id
            ? 'border-brand-600 ring-2 ring-ring/50'
            : 'border-border hover:border-border-strong'} {top.isActive ? '' : 'opacity-80'}"
        >
          {@render linkRow(top, false)}

          <ul
            aria-label={`Sub-links of ${top.label}`}
            class="nav-children mx-3 mb-3 min-h-9 space-y-2 rounded-lg border border-dashed border-border bg-surface-alt/50 p-2"
            use:dndzone={dragOptions(top.children)}
            onconsider={(event) => onChildConsider(top.id, event)}
            onfinalize={(event) => onChildFinalize(top.id, event)}
          >
            {#each top.children as child (child.id)}
              <li
                animate:flip={{ duration: flipDurationMs }}
                data-testid="nav-child"
                data-link-id={child.id}
                class="flex flex-col rounded-lg border bg-surface transition-[box-shadow,border-color] motion-reduce:transition-none {selectedId === child.id
                  ? 'border-brand-600 ring-2 ring-ring/50'
                  : 'border-border hover:border-border-strong'} {child.isActive ? '' : 'opacity-80'}"
              >
                {@render linkRow(child, true)}
              </li>
            {/each}
          </ul>

          <div class="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
            <button type="button" class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-link hover:bg-surface-alt" onclick={() => openAdd(top.id)}>
              <CornerDownRight class="h-3.5 w-3.5" aria-hidden="true" /> Add child link
              <span class="sr-only"> under {top.label}</span>
            </button>
          </div>
          {#if adding === top.id}
            <div class="px-3 pb-3">
              <NavLinkForm prefix={`add-${top.id}`} parentId={top.id} parentLabel={top.label} nextOrder={top.children.reduce((m, c) => Math.max(m, c.order), 0) + 1} oncancel={() => (adding = null)} />
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <p class="text-xs text-muted-foreground">
      Drag the grip handle, or focus it and use the arrow keys: up/down to move, right to nest under the link above, left to
      un-nest, Delete to remove. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes. Changes are saved as soon as you drop.
    </p>
  </section>

  <aside class="space-y-4 lg:sticky lg:top-20 lg:self-start" aria-label="Preview">
    <NavStructurePreview tree={tops} />
  </aside>
</div>

<p class="sr-only" role="status" aria-live="polite">{announcement}</p>

<ConfirmDialog
  bind:open={() => deleting !== null, (value) => { if (!value) deleting = null; }}
  title={deleting ? `Delete ${deleting.label}?` : 'Delete link?'}
  description={deleting && deleting.children.length > 0
    ? 'Its sub-links are deleted with it. This cannot be undone.'
    : 'This action cannot be undone.'}
  confirmLabel="Delete"
  destructive
  processing={deleteBusy}
  onConfirm={confirmDelete}
/>

<style>
  .nav-children {
    transition: background-color 150ms;
  }
  :global(.nav-drop-target) {
    background-color: color-mix(in oklab, var(--color-brand-600) 10%, transparent);
  }
  @media (prefers-reduced-motion: reduce) {
    .nav-children {
      transition: none;
    }
  }
</style>
