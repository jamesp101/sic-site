<script lang="ts">
  import { actions } from 'astro:actions';
  import { flip } from 'svelte/animate';
  import { tick, untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { EyeOff, GripVertical, Pencil, Plus, Redo2, TriangleAlert, Undo2 } from '@lucide/svelte';
  import { reloadView } from '@/lib/navigation';
  import {
    DEFAULT_NAV_LINKS,
    canIndent,
    canOutdent,
    cloneTree,
    indent,
    isTwoLevel,
    locate,
    moveDown,
    moveUp,
    navWarnings,
    opensDropdown,
    outdent,
    renumber,
    samePayload,
    toPayload,
    treeFromPayload,
    type LinkSuggestion,
    type NavNode,
    type ReorderItem,
  } from '@/lib/nav-tree';
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { parseActionError, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';
  import NavHeaderPreview from './NavHeaderPreview.svelte';
  import NavKindBadge from './NavKindBadge.svelte';
  import NavLinkForm from './NavLinkForm.svelte';
  import NavRowMenu from './NavRowMenu.svelte';

  let {
    links,
    departments,
    suggestions,
    knownPaths,
  }: {
    links: NavNode[];
    departments: { name: string; slug: string }[];
    suggestions: LinkSuggestion[];
    knownPaths: string[];
  } = $props();

  const flipDurationMs = 150;
  const toolbarIconButton =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-surface';
  const smallButton =
    'inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-surface px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-alt';

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
  let showHidden = $state(false);
  let dragging = $state(false);
  let renamingId = $state<number | null>(null);
  let renameValue = $state('');
  let seeding = $state(false);
  let snapshot: NavNode[] | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const nextTopOrder = $derived(tops.reduce((max, top) => Math.max(max, top.order), 0) + 1);
  const total = $derived(tops.reduce((sum, top) => sum + 1 + top.children.length, 0));
  const hiddenCount = $derived(tops.reduce((sum, top) => sum + (top.isActive ? 0 : 1) + top.children.filter((c) => !c.isActive).length, 0));
  const warnings = $derived(navWarnings(tops, knownPaths));
  const warningList = $derived(
    [...warnings].flatMap(([id, list]) => list.map((warning) => ({ id, label: find(id)?.label ?? '', warning }))),
  );
  const warningText = { 'internal-missing': 'page not found', duplicate: 'duplicate' } as const;
  const warningBadge = { 'internal-missing': 'Page not found', duplicate: 'Duplicate link' } as const;

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
    dragging = true;
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
      dragging = false;
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
    if (!saving && editingId === null && renamingId === null && adding === null) dragDisabled = false;
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
      F2: () => startRename(node),
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

  function patchNode(tree: NavNode[], id: number, patch: Partial<Pick<NavNode, 'label' | 'isActive'>>): NavNode[] {
    return tree.map((top) => ({
      ...top,
      ...(top.id === id ? patch : {}),
      children: top.children.map((child) => (child.id === id ? { ...child, ...patch } : child)),
    }));
  }

  /** Saves a label/visibility change optimistically; reverts on failure. Returns whether it was saved. */
  async function updateNode(node: NavNode, patch: Partial<Pick<NavNode, 'label' | 'isActive'>>): Promise<boolean> {
    if (saving) return false;
    const parent = parentOf(node.id);
    const before = tops;
    const savedBefore = saved;
    tops = patchNode(cloneTree(tops), node.id, patch);
    saved = patchNode(saved, node.id, patch);
    saving = true;
    const { error } = await actions.navlinks.update({
      id: node.id,
      label: patch.label ?? node.label,
      url: node.url,
      order: node.order,
      isActive: patch.isActive ?? node.isActive,
      parentId: parent?.id ?? null,
    });
    saving = false;
    if (error) {
      tops = before;
      saved = savedBefore;
      toast.error(parseActionError(error).message || 'The link could not be updated.');
      return false;
    }
    return true;
  }

  async function toggleActive(node: NavNode) {
    const isActive = !node.isActive;
    if (!(await updateNode(node, { isActive }))) return;
    announcement = `${node.label} is now ${isActive ? 'visible' : 'hidden'}.`;
    toast.success(isActive ? `“${node.label}” is visible.` : `“${node.label}” is hidden.`);
  }

  // ---- inline rename ----------------------------------------------------------------------------------

  function startRename(node: NavNode) {
    if (saving || editingId !== null) return;
    renameValue = node.label;
    renamingId = node.id;
  }

  const focusAndSelect = (input: HTMLInputElement) => {
    input.focus();
    input.select();
  };

  const focusHandle = async (id: number) => {
    await tick();
    document.querySelector<HTMLElement>(`[data-handle="${id}"]`)?.focus();
  };

  async function saveRename(node: NavNode) {
    const label = renameValue.trim();
    if (!label) {
      toast.error('The label is required.');
      return;
    }
    renamingId = null;
    if (label !== node.label && (await updateNode(node, { label }))) {
      announcement = `Renamed to ${label}.`;
      toast.success(`Renamed to “${label}”.`);
    }
    await focusHandle(node.id);
  }

  function cancelRename(node: NavNode, refocus: boolean) {
    if (renamingId !== node.id) return;
    renamingId = null;
    if (refocus) void focusHandle(node.id);
  }

  function onRenameKeydown(event: KeyboardEvent, node: NavNode) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveRename(node);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelRename(node, true);
    }
  }

  // ---- selection, default menu --------------------------------------------------------------------------

  /** Selects a row (from the preview or the warnings summary), scrolls to it and moves focus to its handle. */
  function selectRow(id: number) {
    selectedId = id;
    const row = document.querySelector<HTMLElement>(`[data-link-id="${id}"]`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    row?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    row?.querySelector<HTMLElement>('[data-handle]')?.focus({ preventScroll: true });
  }

  async function useDefaultMenu() {
    seeding = true;
    for (const [index, link] of DEFAULT_NAV_LINKS.entries()) {
      const { error } = await actions.navlinks.create({ ...link, isActive: true, order: index + 1, parentId: null });
      if (error) {
        toast.error(parseActionError(error).message || 'The default menu could not be created.');
        break;
      }
    }
    await reloadView();
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

  /** Whether a link has a sibling above/below it to swap with. */
  function canMove(id: number, delta: -1 | 1): boolean {
    const pos = locate(tops, id);
    if (!pos) return false;
    const length = pos.parentIndex === null ? tops.length : tops[pos.parentIndex].children.length;
    const target = pos.index + delta;
    return target >= 0 && target < length;
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
  {@const nodeWarnings = warnings.get(node.id) ?? []}
  {@const dropdown = opensDropdown(node, !child)}
  <div class="flex flex-wrap items-center gap-x-2 gap-y-2 p-3" onfocusin={() => (selectedId = node.id)}>
    <button
      type="button"
      data-handle={node.id}
      class="inline-flex h-9 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-alt hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed"
      aria-label={`Reorder ${node.label}. Drag with the pointer, or press arrow keys: up and down to move, right to nest, left to un-nest, F2 to rename, Delete to remove.`}
      title="Drag to reorder"
      disabled={saving}
      onmousedowncapture={startDrag}
      ontouchstartcapture={startDrag}
      onkeydown={(event) => onHandleKeydown(event, node)}
    >
      <GripVertical class="h-4 w-4" aria-hidden="true" />
    </button>

    <div class="min-w-0 flex-1 basis-56">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        {#if renamingId === node.id}
          <input
            type="text"
            maxlength="255"
            aria-label={`Rename ${node.label}`}
            bind:value={renameValue}
            {@attach focusAndSelect}
            onkeydown={(event) => onRenameKeydown(event, node)}
            onblur={() => cancelRename(node, false)}
            class="min-w-0 max-w-full rounded-md border border-brand-600 bg-surface px-2 py-0.5 text-sm font-semibold text-foreground outline-none ring-2 ring-ring/40"
          />
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <p
            data-testid="nav-label"
            title="Double-click to rename"
            ondblclick={() => startRename(node)}
            class="min-w-0 max-w-full cursor-text truncate text-sm font-semibold {node.isActive ? 'text-foreground' : 'text-muted-foreground'}"
          >
            {node.label}
          </p>
        {/if}
        <NavKindBadge url={node.url} />
        {#if !node.isActive}
          <span
            data-testid="nav-hidden-badge"
            class="inline-flex shrink-0 items-center gap-1 rounded-full bg-file-other-bg px-2 py-0.5 text-xs font-semibold text-file-other-fg"
          >
            <EyeOff class="h-3 w-3" aria-hidden="true" /> Hidden
          </span>
        {/if}
        {#each nodeWarnings as warning (warning.kind)}
          <span
            data-testid="nav-warning"
            title={warning.message}
            class="inline-flex shrink-0 items-center gap-1 rounded-full bg-file-archive-bg px-2 py-0.5 text-xs font-semibold text-file-archive-fg"
          >
            <TriangleAlert class="h-3 w-3" aria-hidden="true" /> {warningBadge[warning.kind]}
          </span>
        {/each}
      </div>
      <p class="truncate font-mono text-xs {dropdown ? 'text-muted-foreground line-through' : 'text-link'}">{node.url}</p>
      {#if dropdown}
        <p class="text-xs text-muted-foreground">Opens a dropdown — its URL isn't used.</p>
      {/if}
      {#each nodeWarnings as warning (warning.kind)}
        <p class="sr-only">{warning.message}</p>
      {/each}
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={node.isActive}
      aria-label={`Visible in navigation: ${node.label}`}
      title={node.isActive ? 'Visible — click to hide' : 'Hidden — click to show'}
      disabled={saving}
      onclick={() => toggleActive(node)}
      class="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-border-strong transition-colors disabled:opacity-60 {node.isActive
        ? 'bg-brand-800 dark:bg-gold-500'
        : 'bg-surface-alt'}"
    >
      <span
        class="inline-block h-4 w-4 rounded-full shadow-brand-sm transition-transform motion-reduce:transition-none {node.isActive
          ? 'translate-x-[1.125rem] bg-white dark:bg-brand-950'
          : 'translate-x-1 bg-muted-foreground'}"
      ></span>
    </button>

    <button type="button" class={smallButton} aria-label={`Edit ${node.label}`} title="Edit link" onclick={() => openEdit(node.id)}>
      <Pencil class="h-3.5 w-3.5" aria-hidden="true" /> Edit
    </button>

    <NavRowMenu
      label={node.label}
      isChild={child}
      busy={saving}
      canUp={canMove(node.id, -1)}
      canDown={canMove(node.id, 1)}
      canNest={canIndent(tops, node.id)}
      canUnnest={canOutdent(tops, node.id)}
      nestHint={node.children.length > 0 ? 'A link with sub-links cannot become a sub-link' : 'There is no top-level link above to nest under'}
      onup={() => up(node.id)}
      ondown={() => down(node.id)}
      onnest={() => nest(node.id)}
      onunnest={() => unnest(node.id)}
      onaddchild={() => openAdd(node.id)}
      ondelete={() => (deleting = node)}
    />
  </div>

  {#if editingId === node.id}
    <div class="px-3 pb-3">
      <NavLinkForm
        prefix={`edit-${node.id}`}
        {suggestions}
        link={{ id: node.id, label: node.label, url: node.url, order: node.order, isActive: node.isActive, parentId: parent?.id ?? null }}
        oncancel={() => (editingId = null)}
      />
    </div>
  {/if}
{/snippet}

<div class="space-y-6">
  <NavHeaderPreview tree={tops} {departments} bind:showHidden {selectedId} onselect={selectRow} />

  <section aria-labelledby="nav-tree-title" class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 id="nav-tree-title" data-testid="nav-summary" class="flex flex-wrap items-baseline gap-x-0 text-foreground">
        <span class="text-lg font-bold">{total} {total === 1 ? 'link' : 'links'}</span>
        <span class="text-sm font-medium text-muted-foreground">{` · ${hiddenCount} hidden · ${warningList.length} ${warningList.length === 1 ? 'warning' : 'warnings'}`}</span>
        {#if saving}<span class="ml-3 text-xs font-normal text-muted-foreground" role="status">Saving…</span>{/if}
      </h2>
      <TooltipProvider>
        <div class="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger
              type="button"
              class={toolbarIconButton}
              aria-label="Undo"
              aria-keyshortcuts="Control+Z Meta+Z"
              disabled={saving || undoStack.length === 0}
              onclick={() => travel('undo')}
            >
              <Undo2 class="h-4 w-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              type="button"
              class={toolbarIconButton}
              aria-label="Redo"
              aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
              disabled={saving || redoStack.length === 0}
              onclick={() => travel('redo')}
            >
              <Redo2 class="h-4 w-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
          <button type="button" class={primaryButtonClass} onclick={() => openAdd('top')}>
            <Plus class="h-4 w-4" aria-hidden="true" /> Add link
          </button>
        </div>
      </TooltipProvider>
    </div>

    {#if warningList.length > 0}
      <div
        data-testid="nav-warnings"
        class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border-strong bg-file-archive-bg px-3 py-2 text-sm text-file-archive-fg"
      >
        <TriangleAlert class="h-4 w-4 shrink-0" aria-hidden="true" />
        <span class="font-semibold">{warningList.length} {warningList.length === 1 ? 'warning' : 'warnings'}:</span>
        {#each warningList as item (item.id + item.warning.kind)}
          <button
            type="button"
            title={item.warning.message}
            class="rounded font-semibold underline underline-offset-2 hover:no-underline"
            onclick={() => selectRow(item.id)}
          >
            {item.label} ({warningText[item.warning.kind]})
          </button>
        {/each}
        <span class="text-xs">Warnings never block saving.</span>
      </div>
    {/if}

    {#if adding === 'top'}
      <NavLinkForm prefix="add-top" {suggestions} nextOrder={nextTopOrder} oncancel={() => (adding = null)} />
    {/if}

    {#if tops.length === 0 && adding !== 'top'}
      <div class="space-y-4 rounded-xl border border-dashed border-border-strong bg-surface p-8 text-center">
        <p class="text-sm text-muted-foreground">No navigation links yet. The public site shows its default menu until you add one.</p>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button type="button" class={primaryButtonClass} onclick={() => openAdd('top')}>
            <Plus class="h-4 w-4" aria-hidden="true" /> Add your first link
          </button>
          <button type="button" class={secondaryButtonClass} disabled={seeding} onclick={useDefaultMenu}>
            {seeding ? 'Creating…' : 'Use the default menu'}
          </button>
        </div>
      </div>
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
          class="scroll-mt-24 rounded-xl border bg-card shadow-brand-sm transition-[box-shadow,border-color] motion-reduce:transition-none {selectedId === top.id
            ? 'border-brand-600 ring-2 ring-ring/50'
            : top.isActive
              ? 'border-border hover:border-border-strong'
              : 'border-dashed border-border-strong bg-surface-alt'}"
        >
          {@render linkRow(top, false)}

          <ul
            aria-label={`Sub-links of ${top.label}`}
            class="nav-children {top.children.length > 0
              ? 'mb-3 ml-12 mr-3 space-y-2 border-l-2 border-border pl-3'
              : dragging
                ? 'nav-children-empty mx-3 mb-2 min-h-7 rounded-lg border border-dashed border-border-strong bg-surface-alt/50'
                : 'h-0'}"
            use:dndzone={dragOptions(top.children)}
            onconsider={(event) => onChildConsider(top.id, event)}
            onfinalize={(event) => onChildFinalize(top.id, event)}
          >
            {#each top.children as child (child.id)}
              <li
                animate:flip={{ duration: flipDurationMs }}
                data-testid="nav-child"
                data-link-id={child.id}
                class="flex scroll-mt-24 flex-col rounded-lg border bg-surface transition-[box-shadow,border-color] motion-reduce:transition-none {selectedId === child.id
                  ? 'border-brand-600 ring-2 ring-ring/50'
                  : child.isActive
                    ? 'border-border hover:border-border-strong'
                    : 'border-dashed border-border-strong bg-surface-alt'}"
              >
                {@render linkRow(child, true)}
              </li>
            {/each}
          </ul>

          {#if adding === top.id}
            <div class="px-3 pb-3">
              <NavLinkForm prefix={`add-${top.id}`} {suggestions} parentId={top.id} parentLabel={top.label} nextOrder={top.children.reduce((m, c) => Math.max(m, c.order), 0) + 1} oncancel={() => (adding = null)} />
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <p class="text-xs text-muted-foreground">
      Drag the grip handle, or focus it and use the arrow keys: up/down to move, right to nest under the link above, left to
      un-nest, F2 to rename, Delete to remove. Double-click a label to rename it. Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z redoes.
      Changes are saved as soon as you drop.
    </p>
  </section>
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
  :global(.nav-children-empty:not(:has(> li))::before) {
    content: 'Drop here to make a sub-link';
    display: block;
    padding: 0.25rem;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted-foreground);
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
