<script lang="ts">
  import { actions } from 'astro:actions';
  import { tick, untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    ExternalLink,
    Maximize,
    Pencil,
    Plus,
    Redo2,
    Search,
    Trash,
    Undo2,
    UserPlus,
    Users,
    ZoomIn,
    ZoomOut,
  } from '@lucide/svelte';
  import { getInitials } from '@/lib/initials';
  import {
    buildOrgTree,
    keyboardMove,
    matchMembers,
    moveRelative,
    positionOf,
    siblingsOf,
    type DropPosition,
    type OrgMember,
    type OrgNode,
    type OrgPlacement,
  } from '@/lib/org-tree';
  import {
    afterDelete,
    beginPan,
    cancelRename,
    canvasClick,
    closeInspector as closeInspectorState,
    commitRename,
    createdMember,
    dragEnd,
    dragLeaveCard,
    dragLeaveLane,
    dragOverCard,
    dragOverLane,
    dragStart,
    dropOnCard,
    dropOnLane,
    dropZone,
    endPan,
    fitViewport,
    initialDrag,
    initialPan,
    initialUi,
    isPanning,
    itemKeyIntent,
    movePan,
    nextSearchMatch,
    panBy,
    peerAnchor,
    revealShift,
    selectMember,
    setRenameValue,
    startCreate,
    startRename,
    takeControl,
    wheelIntent,
    zoomAt,
    type ChartUi,
    type DragState,
    type DropResult,
    type PanState,
    type Viewport,
  } from '@/lib/org-chart-interaction';
  import { createOrgChartSession, MEMBER_GONE, type MemberValues, type OrgChartPort } from '@/lib/org-chart-session';
  import type { EditResult } from '@/lib/tree-edit-session';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { append, parseActionError, primaryButtonClass, secondaryButtonClass, type FormErrors } from '../shared/form-utils';
  import MemberInspector from './MemberInspector.svelte';

  let {
    departmentId,
    departmentName,
    departmentSlug,
    members: initialMembers,
  }: {
    departmentId: number;
    departmentName: string;
    departmentSlug: string;
    members: OrgMember[];
  } = $props();

  const DESKTOP = '(min-width: 768px)';

  const port: OrgChartPort = {
    async reorder(placements) {
      const { error } = await actions.members.reorder({ departmentId, placements });
      return error ? { ok: false, message: parseActionError(error).message } : { ok: true };
    },
    async rename(current, name) {
      const { error } = await actions.members.update(formFor({ ...current, name }));
      if (!error) return { ok: true };
      const failure = parseActionError(error);
      return { ok: false, message: failure.fields.name || failure.message };
    },
    async create(values) {
      const { data, error } = await actions.members.create(formFor(values));
      if (error) return { ok: false, failure: parseActionError(error) };
      return { ok: true, id: data.id, order: data.order, imageUrl: data.imageUrl };
    },
    async update(id, values) {
      const { data, error } = await actions.members.update(formFor({ id, ...values }));
      if (error) return { ok: false, failure: parseActionError(error) };
      return { ok: true, imageUrl: data.imageUrl };
    },
    async remove(id) {
      const { error } = await actions.members.delete({ departmentId, id });
      return error ? { ok: false, message: parseActionError(error).message } : { ok: true };
    },
  };
  // The session owns the confirmed and drawn (optimistic) member lists, the save queue, rollback and undo history.
  const session = createOrgChartSession({
    members: untrack(() => initialMembers),
    port,
    onChange: (next) => (view = next),
  });
  let view = $state.raw(session.snapshot());
  const members = $derived(view.tree);

  let ui = $state.raw<ChartUi>(initialUi);
  const selectedId = $derived(ui.selectedId);
  const creating = $derived(ui.creating);
  const renamingId = $derived(ui.renamingId);
  const renameValue = $derived(ui.renameValue);
  let focusId = $state<number | null>(null);
  let hoverId = $state<number | null>(null);
  let query = $state('');
  let announcement = $state('');

  let cam = $state.raw<Viewport>({ scale: 1, tx: 0, ty: 0 });
  let pan = $state.raw<PanState>(initialPan);
  const panning = $derived(isPanning(pan));

  let drag = $state.raw<DragState>(initialDrag);
  const dragId = $derived(drag.dragId);
  const drop = $derived(drag.drop);

  let deleteTarget = $state<OrgMember | null>(null);
  let deleteOpen = $state(false);
  let deleting = $state(false);

  let root = $state<HTMLElement | null>(null);
  let viewport = $state<HTMLDivElement | null>(null);
  let content = $state<HTMLDivElement | null>(null);

  const forest = $derived(buildOrgTree(members));
  const flat = $derived.by(() => {
    const ids: number[] = [];
    const walk = (nodes: OrgNode[]) => {
      for (const node of nodes) {
        ids.push(node.member.id);
        walk(node.children);
      }
    };
    walk(forest);
    return ids;
  });
  const byId = $derived(new Map(members.map((m) => [m.id, m])));
  const selected = $derived(selectedId === null ? null : (byId.get(selectedId) ?? null));
  const tabbableId = $derived(focusId !== null && byId.has(focusId) ? focusId : (flat[0] ?? null));
  const matches = $derived(new Set(matchMembers(members, query)));
  const searching = $derived(query.trim().length > 0);
  const deleteReports = $derived(deleteTarget ? siblingsOf(members, deleteTarget.id).length : 0);
  const deleteManager = $derived(deleteTarget?.parentId == null ? null : (byId.get(deleteTarget.parentId) ?? null));

  const isDesktop = () => window.matchMedia(DESKTOP).matches;

  function announce(text: string) {
    announcement = announcement === text ? `${text}\u00a0` : text;
  }

  // ---------------------------------------------------------------- canvas

  function fit() {
    if (!viewport || !content || !isDesktop()) return;
    const next = fitViewport(
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { width: content.offsetWidth, height: content.offsetHeight },
    );
    if (next) cam = next;
  }

  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    if (!viewport) return;
    pan = takeControl(pan);
    const rect = viewport.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    cam = zoomAt(cam, factor, px, py);
  }

  function manualFit() {
    pan = takeControl(pan);
    fit();
  }

  /** Pans so `el` is inside the viewport (or centred when `center`). */
  function reveal(el: HTMLElement, center = false) {
    if (!viewport) return;
    if (!isDesktop()) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const shift = revealShift(viewport.getBoundingClientRect(), el.getBoundingClientRect(), center);
    if (shift) cam = panBy(cam, shift.dx, shift.dy);
  }

  async function focusMember(id: number, center = false) {
    await tick();
    const item = root?.querySelector<HTMLElement>(`[data-member-id="${id}"]`);
    if (!item) return;
    item.focus({ preventScroll: true });
    const card = item.querySelector<HTMLElement>(':scope > [data-testid="org-card"]');
    if (card) reveal(card, center);
  }

  $effect(() => {
    if (!viewport || !content) return;
    const el = viewport;
    const onWheel = (event: WheelEvent) => {
      if (!isDesktop()) return;
      event.preventDefault();
      pan = takeControl(pan);
      const intent = wheelIntent({ deltaX: event.deltaX, deltaY: event.deltaY, zoomModifier: event.ctrlKey || event.metaKey });
      if (intent.kind === 'zoom') zoomBy(intent.factor, event.clientX, event.clientY);
      else cam = panBy(cam, intent.dx, intent.dy);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // Fit once the first layout (fonts, photos) settles; stops as soon as the user interacts.
    const observer = new ResizeObserver(() => {
      if (pan.autoFit) fit();
    });
    observer.observe(content);
    fit();
    return () => {
      el.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  });

  function onPanDown(event: PointerEvent) {
    pan = takeControl(pan);
    if (event.button !== 0 || !isDesktop() || !viewport) return;
    if ((event.target as HTMLElement).closest('[data-testid="org-card"], button, input, a')) return;
    pan = beginPan(pan, { x: event.clientX, y: event.clientY }, cam);
    viewport.setPointerCapture(event.pointerId);
  }

  function onPanMove(event: PointerEvent) {
    const next = movePan(pan, cam, { x: event.clientX, y: event.clientY });
    pan = next.pan;
    cam = next.view;
  }

  function onPanUp() {
    const ended = endPan(pan);
    if (!ended) return;
    pan = ended.pan;
    ui = canvasClick(ui, ended.moved);
  }

  /** The browser may scroll the clipped canvas to reveal a focused card; the transform is the only offset. */
  function onViewportScroll() {
    if (viewport && isDesktop()) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  // ------------------------------------------------------------ persistence

  /** Toasts and announces a save that failed and was rolled back; returns the result. */
  async function report(pending: Promise<EditResult>): Promise<EditResult> {
    const result = await pending;
    if (result.status === 'reverted') {
      toast.error(result.message);
      announce(result.announcement);
    }
    return result;
  }

  function describe(id: number): string {
    const { index, count, level, parentId } = positionOf(members, id);
    const parent = parentId === null ? null : byId.get(parentId);
    const name = byId.get(id)?.name ?? 'Member';
    return `${name} moved to position ${index} of ${count} ${parent ? `under ${parent.name}` : 'at the top level'}, level ${level}.`;
  }

  /** Applies a structure change at once and queues its save; false when there is nothing to move. */
  function restructure(placements: OrgPlacement[] | null, id: number): boolean {
    if (!placements?.length) return false;
    void report(session.edit({ kind: 'place', placements }));
    announce(describe(id));
    return true;
  }

  /** Re-keyed cards are re-inserted by the browser, which drops focus; put it back on the same card. */
  async function keepFocus(apply: () => void) {
    const focused = document.activeElement?.closest<HTMLElement>('[data-member-id]');
    apply();
    if (!focused || !root?.contains(focused)) return;
    const id = Number(focused.dataset.memberId);
    await tick();
    if (document.activeElement === document.body || !root.contains(document.activeElement)) void focusMember(id);
  }

  function undo() {
    if (!view.canUndo) return;
    void keepFocus(() => {
      void report(session.undo());
      announce('Undid the last structure change.');
    });
  }

  function redo() {
    if (!view.canRedo) return;
    void keepFocus(() => {
      void report(session.redo());
      announce('Redid the structure change.');
    });
  }

  function formFor(values: { id?: number; name: string; role: string; parentId: number | null; order: number; image?: File | null }) {
    const form = new FormData();
    append(form, 'id', values.id);
    append(form, 'departmentId', departmentId);
    append(form, 'name', values.name);
    append(form, 'role', values.role);
    append(form, 'parentId', values.parentId);
    append(form, 'order', values.order);
    append(form, 'image', values.image);
    return form;
  }

  async function saveInspector(values: MemberValues): Promise<FormErrors | null> {
    if (ui.creating) return createMember(values);
    if (selectedId === null) return { fields: {}, message: MEMBER_GONE };
    const result = await session.update(selectedId, values);
    if (!result.ok) return result.failure;
    toast.success('Member updated.');
    announce(`${values.name} updated.`);
    return null;
  }

  async function createMember(values: MemberValues): Promise<FormErrors | null> {
    const context = ui.creating;
    const result = await session.create(values);
    if (!result.ok) return result.failure;
    const created = result.member;
    ui = createdMember(ui, created.id);
    toast.success(`${created.name} added.`);
    // "Add peer" slots the new member right after the card it was added beside.
    const anchor = peerAnchor(context, values);
    if (anchor !== null) restructure(moveRelative(members, created.id, anchor, 'after'), created.id);
    else announce(`${created.name} added.`);
    void focusMember(created.id);
    return null;
  }

  async function commitRenameOf(id: number) {
    const done = commitRename(ui, members, id);
    if (!done) return;
    ui = done.ui;
    if (done.name) {
      const result = await report(session.edit({ kind: 'rename', id, name: done.name }, { record: false }));
      if (result.status === 'saved') announce(`Renamed to ${done.name}.`);
    }
    void focusMember(id);
  }

  function beginRename(id: number) {
    ui = startRename(ui, members, id);
  }

  function requestDelete(member: OrgMember) {
    deleteTarget = member;
    deleteOpen = true;
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    deleting = true;
    const result = await session.remove(target.id);
    deleting = false;
    deleteOpen = false;
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    ui = afterDelete(ui, members, target);
    toast.success(`${target.name} removed.`);
    announce(`${target.name} removed. Direct reports moved up.`);
    if (selectedId !== null) void focusMember(selectedId);
  }

  // -------------------------------------------------------------- selection

  function select(id: number | null) {
    ui = selectMember(ui, id);
  }

  function beginCreate(parentId: number | null, afterId: number | null) {
    ui = startCreate(ui, members, parentId, afterId);
  }

  function closeInspector() {
    const id = selectedId;
    ui = closeInspectorState(ui);
    if (id !== null) void focusMember(id);
  }

  // ------------------------------------------------------------- tree input

  function onItemKey(event: KeyboardEvent, id: number) {
    if (event.target !== event.currentTarget) return;
    const member = byId.get(id);
    const intent = itemKeyIntent(event, id, members, flat);
    if (!member || !intent) return;
    event.preventDefault();
    switch (intent.kind) {
      case 'move':
        if (!restructure(keyboardMove(members, id, intent.move), id)) announce(`${member.name} cannot move ${intent.label}.`);
        void focusMember(id);
        break;
      case 'open':
        select(id);
        void tick().then(() => document.getElementById('member-name')?.focus());
        break;
      case 'rename':
        beginRename(id);
        break;
      case 'delete':
        requestDelete(member);
        break;
      case 'focus':
        void focusMember(intent.id);
        break;
    }
  }

  function onRootKey(event: KeyboardEvent) {
    pan = takeControl(pan);
    if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (mod && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    } else if (!mod && !event.altKey) {
      if (event.key === '+' || event.key === '=') zoomBy(1.2);
      else if (event.key === '-') zoomBy(1 / 1.2);
      else if (event.key === '0') manualFit();
    }
  }

  function onSearchKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = nextSearchMatch(flat, matches, focusId);
    if (next !== null) void focusMember(next, true);
  }

  // ----------------------------------------------------------- drag and drop

  function zoneOf(event: DragEvent, card: HTMLElement): DropPosition {
    const rect = card.getBoundingClientRect();
    return dropZone({ x: event.clientX, y: event.clientY }, rect, isDesktop());
  }

  function onCardDragStart(event: DragEvent, id: number) {
    drag = dragStart(id);
    hoverId = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
    }
  }

  function onCardDragEnd() {
    drag = dragEnd();
  }

  function onCardDragOver(event: DragEvent, id: number) {
    const over = dragOverCard(drag, members, id, zoneOf(event, event.currentTarget as HTMLElement));
    if (!over) return;
    drag = over.drag;
    if (over.allowed) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } else if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
  }

  /** The browser fires `dragenter` on the new target before `dragleave` on the old one: only clear our own state. */
  function onCardDragLeave(event: DragEvent, id: number) {
    drag = dragLeaveCard(drag, id, (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null));
  }

  function onCardDrop(event: DragEvent, id: number) {
    const dropped = dropOnCard(drag, members, id, zoneOf(event, event.currentTarget as HTMLElement));
    if (!dropped) return;
    event.preventDefault();
    finishDrop(dropped);
  }

  function onLaneDragOver(event: DragEvent) {
    const next = dragOverLane(drag);
    if (!next) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    drag = next;
  }

  function onLaneDrop(event: DragEvent) {
    const dropped = dropOnLane(drag, members);
    if (!dropped) return;
    event.preventDefault();
    finishDrop(dropped);
  }

  function finishDrop({ drag: next, moving, placements }: DropResult) {
    drag = next;
    restructure(placements, moving);
    void focusMember(moving);
  }

  function focusSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  const inspectorHeading = $derived(
    creating
      ? creating.afterId !== null
        ? 'Add peer'
        : creating.parentId !== null
          ? 'Add direct report'
          : 'Add member'
      : (selected?.name ?? 'Member'),
  );
  const inspectorDescription = $derived(
    creating
      ? creating.parentId === null
        ? 'The new member will be at the top level.'
        : `Reports to ${byId.get(creating.parentId)?.name ?? 'the selected member'}.`
      : (selected?.role ?? ''),
  );

  const toolButton =
    'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50';
  const actionButton =
    'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-primary text-primary-foreground shadow-brand-sm transition-colors hover:opacity-90';
  const miniButton =
    'inline-flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground shadow-brand-sm transition-colors hover:bg-surface-alt';
</script>

{#snippet branch(nodes: OrgNode[], level: number)}
  <ul
    class="org-list"
    class:org-root={level === 1}
    role={level === 1 ? 'tree' : 'group'}
    aria-label={level === 1 ? `${departmentName} organization chart` : undefined}
  >
    {#each nodes as node, i (node.member.id)}
      {@const m = node.member}
      {@const d = drop && drop.id === m.id ? drop : null}
      {@const showActions = dragId === null && (selectedId === m.id || hoverId === m.id) && renamingId !== m.id}
      <li
        class="org-item"
        role="treeitem"
        aria-level={level}
        aria-posinset={i + 1}
        aria-setsize={nodes.length}
        aria-selected={selectedId === m.id}
        aria-expanded={node.children.length > 0 ? true : undefined}
        aria-labelledby="org-{m.id}-name org-{m.id}-role"
        tabindex={tabbableId === m.id ? 0 : -1}
        data-member-id={m.id}
        data-name={m.name}
        onkeydown={(event) => onItemKey(event, m.id)}
        onfocus={() => (focusId = m.id)}
      >
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div
          class="org-card"
          data-testid="org-card"
          class:selected={selectedId === m.id}
          class:match={searching && matches.has(m.id)}
          class:dim={searching && !matches.has(m.id)}
          class:dragging={dragId === m.id}
          class:drop-child={d?.ok && d.position === 'child'}
          class:drop-before={d?.ok && d.position === 'before'}
          class:drop-after={d?.ok && d.position === 'after'}
          class:drop-deny={d !== null && !d.ok}
          draggable={renamingId !== m.id}
          ondragstart={(event) => onCardDragStart(event, m.id)}
          ondragend={onCardDragEnd}
          ondragenter={(event) => onCardDragOver(event, m.id)}
          ondragover={(event) => onCardDragOver(event, m.id)}
          ondragleave={(event) => onCardDragLeave(event, m.id)}
          ondrop={(event) => onCardDrop(event, m.id)}
          onclick={() => select(m.id)}
          ondblclick={(event) => {
            if (!(event.target as HTMLElement).closest('button, input')) beginRename(m.id);
          }}
          onpointerenter={() => (hoverId = m.id)}
          onpointerleave={() => (hoverId = hoverId === m.id ? null : hoverId)}
        >
          {#if m.imageUrl}
            <img
              src={m.imageUrl}
              alt="Photo of {m.name}"
              width="64"
              height="64"
              draggable="false"
              class="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          {:else}
            <span
              class="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-800 dark:bg-surface-alt dark:text-gold-400"
              aria-hidden="true"
            >
              {getInitials(m.name)}
            </span>
          {/if}
          <span class="min-w-0">
            {#if renamingId === m.id}
              <input
                use:focusSelect
                value={renameValue}
                oninput={(event) => (ui = setRenameValue(ui, event.currentTarget.value))}
                type="text"
                maxlength="255"
                aria-label="Rename {m.name}"
                class="w-full rounded border border-border-strong bg-surface px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-brand-600 focus:ring-2 focus:ring-ring/40"
                onkeydown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitRenameOf(m.id);
                  } else if (event.key === 'Escape') {
                    ui = cancelRename(ui);
                    void focusMember(m.id);
                  }
                }}
                onblur={() => void commitRenameOf(m.id)}
                onclick={(event) => event.stopPropagation()}
              />
            {:else}
              <span
                id="org-{m.id}-name"
                data-testid="member-name"
                class="block text-sm font-semibold leading-snug text-foreground">{m.name}</span
              >
            {/if}
            <span
              id="org-{m.id}-role"
              class="mt-0.5 block text-xs font-medium uppercase tracking-wider text-link">{m.role}</span
            >
          </span>

          {#if showActions}
            <span class="absolute -top-3.5 right-3 z-10 flex gap-1">
              <button
                type="button"
                class={miniButton}
                aria-label="Edit {m.name}"
                title="Edit"
                onclick={(event) => {
                  event.stopPropagation();
                  select(m.id);
                  void tick().then(() => document.getElementById('member-name')?.focus());
                }}
              >
                <Pencil class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="{miniButton} hover:text-destructive"
                aria-label="Delete {m.name}"
                title="Delete"
                onclick={(event) => {
                  event.stopPropagation();
                  requestDelete(m);
                }}
              >
                <Trash class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
            <button
              type="button"
              class="{actionButton} absolute -bottom-3.5 left-1/2 z-10 -translate-x-1/2"
              aria-label="Add direct report to {m.name}"
              title="Add direct report"
              onclick={(event) => {
                event.stopPropagation();
                ui = { ...ui, selectedId: m.id };
                beginCreate(m.id, null);
              }}
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="{actionButton} absolute -right-3.5 top-1/2 z-10 -translate-y-1/2"
              aria-label="Add peer beside {m.name}"
              title="Add peer"
              onclick={(event) => {
                event.stopPropagation();
                ui = { ...ui, selectedId: m.id };
                beginCreate(m.parentId, m.id);
              }}
            >
              <UserPlus class="h-4 w-4" aria-hidden="true" />
            </button>
          {/if}
          {#if d && !d.ok}
            <span class="deny-badge" aria-hidden="true">Not allowed</span>
          {:else if d?.ok && d.position === 'child'}
            <span class="deny-badge ok" aria-hidden="true">Report to {m.name}</span>
          {/if}
        </div>
        {#if node.children.length > 0}
          {@render branch(node.children, level + 1)}
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="space-y-3" aria-label="Org chart editor" bind:this={root} onkeydown={onRootKey}>
  <div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Org chart tools">
    <button type="button" class={primaryButtonClass} onclick={() => beginCreate(selectedId, null)}>
      <Plus class="h-4 w-4" aria-hidden="true" /> Add member
    </button>

    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        bind:value={query}
        onkeydown={onSearchKey}
        aria-label="Search members by name or role"
        placeholder="Search members…"
        class="h-9 w-56 rounded-lg border border-border-strong bg-surface pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-ring/40"
      />
    </div>
    {#if searching}
      <span class="text-xs text-muted-foreground" data-testid="search-count">
        {matches.size === 1 ? '1 match' : `${matches.size} matches`}
      </span>
    {/if}

    <span class="inline-flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="member-count">
      <Users class="h-4 w-4" aria-hidden="true" />
      {members.length === 1 ? '1 member' : `${members.length} members`}
    </span>

    <div class="ml-auto flex flex-wrap items-center gap-2">
      <button type="button" class={toolButton} onclick={undo} disabled={!view.canUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
        <Undo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={toolButton} onclick={redo} disabled={!view.canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <Redo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="hidden items-center gap-2 md:flex" role="group" aria-label="Zoom">
        <button type="button" class={toolButton} onclick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out (-)">
          <ZoomOut class="h-4 w-4" aria-hidden="true" />
        </button>
        <span class="w-10 text-center text-xs tabular-nums text-muted-foreground" data-testid="zoom-level">{Math.round(cam.scale * 100)}%</span>
        <button type="button" class={toolButton} onclick={() => zoomBy(1.2)} aria-label="Zoom in" title="Zoom in (+)">
          <ZoomIn class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={toolButton} onclick={manualFit} aria-label="Fit chart to view" title="Fit to view (0)">
          <Maximize class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <a
        href="/departments/{departmentSlug}#org-chart"
        target="_blank"
        rel="noopener"
        class={secondaryButtonClass}
      >
        View public page <ExternalLink class="h-4 w-4" aria-hidden="true" />
        <span class="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  </div>

  <p class="text-xs text-muted-foreground">
    Drag a card onto another to make it report to them, or between cards to reorder. With a card focused: Alt+Arrow keys
    move it, F2 renames, Delete removes. Plus, minus and 0 zoom; Ctrl+Z undoes.
  </p>

  <div class="flex flex-col gap-4 md:h-[min(72vh,52rem)] md:min-h-[26rem] md:flex-row">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={viewport}
      role="group"
      aria-label="Org chart canvas. Drag empty space to pan, Control plus scroll to zoom."
      class="viewport"
      class:panning
      style="--tx:{cam.tx}px;--ty:{cam.ty}px;--s:{cam.scale}"
      onpointerdown={onPanDown}
      onpointermove={onPanMove}
      onpointerup={onPanUp}
      onpointercancel={onPanUp}
      onscroll={onViewportScroll}
    >
      {#if dragId !== null}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="root-lane"
          class:over={drop?.position === 'root'}
          data-testid="root-lane"
          ondragenter={onLaneDragOver}
          ondragover={onLaneDragOver}
          ondragleave={() => (drag = dragLeaveLane(drag))}
          ondrop={onLaneDrop}
        >
          Drop here to make top-level
        </div>
      {/if}

      <div bind:this={content} class="canvas">
        {#if members.length > 0}
          {@render branch(forest, 1)}
        {/if}
      </div>

      {#if members.length === 0 && !creating}
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <p class="text-sm text-muted-foreground">No one is on the {departmentName} org chart yet.</p>
          <button type="button" class={primaryButtonClass} onclick={() => beginCreate(null, null)}>
            <Plus class="h-4 w-4" aria-hidden="true" /> Add the first member
          </button>
        </div>
      {/if}
    </div>

    {#if creating}
      {#key creating.nonce}
        <MemberInspector
          heading={inspectorHeading}
          description={inspectorDescription}
          {members}
          defaults={{ parentId: creating.parentId, order: creating.order }}
          autofocus
          onsave={saveInspector}
          onclose={closeInspector}
        />
      {/key}
    {:else if selected}
      {#key selected.id}
        <MemberInspector
          heading={inspectorHeading}
          description={inspectorDescription}
          {members}
          member={selected}
          defaults={{ parentId: null, order: 1 }}
          onsave={saveInspector}
          ondelete={() => requestDelete(selected)}
          onclose={closeInspector}
        />
      {/key}
    {/if}
  </div>

  <div class="sr-only" role="status" aria-live="polite" data-testid="org-announcer">{announcement}</div>
</section>

<ConfirmDialog
  bind:open={deleteOpen}
  title={deleteTarget ? `Delete ${deleteTarget.name}?` : 'Delete member?'}
  description={deleteReports > 0
    ? `Their ${deleteReports === 1 ? 'direct report' : `${deleteReports} direct reports`} will move up to ${deleteManager ? deleteManager.name : 'the top level'}. This cannot be undone.`
    : 'This member has no direct reports. This cannot be undone.'}
  confirmLabel="Delete"
  destructive
  processing={deleting}
  onConfirm={confirmDelete}
/>

<style>
  /* Same visual language as the public chart (components/site/OrgChart.astro). */
  .viewport {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 16rem;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--surface-alt);
    overflow: auto;
    max-height: 70vh;
  }
  .canvas {
    padding: 1.5rem 1rem;
  }
  .org-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .org-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 1rem;
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    cursor: grab;
  }
  .org-card.selected {
    border-color: var(--ring);
    box-shadow:
      0 0 0 2px var(--ring),
      var(--shadow-sm);
  }
  .org-card.match {
    box-shadow:
      0 0 0 3px var(--gold-500),
      var(--shadow-sm);
  }
  .org-card.dim {
    opacity: 0.5;
  }
  .org-card.dragging {
    opacity: 0.45;
  }
  .org-card.drop-child {
    outline: 3px dashed var(--ring);
    outline-offset: 3px;
    background: var(--accent);
  }
  .org-card.drop-deny {
    outline: 3px dashed var(--destructive);
    outline-offset: 3px;
    cursor: not-allowed;
  }
  .org-card.drop-before::before,
  .org-card.drop-after::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 4px;
    border-radius: 2px;
    background: var(--gold-500);
  }
  .org-card.drop-before::before {
    top: -0.6rem;
  }
  .org-card.drop-after::after {
    bottom: -0.6rem;
  }
  .deny-badge {
    position: absolute;
    left: 50%;
    top: -0.9rem;
    transform: translateX(-50%);
    z-index: 20;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    background: var(--destructive);
    color: var(--destructive-foreground);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
  }
  .deny-badge.ok {
    background: var(--primary);
    color: var(--primary-foreground);
  }
  .org-item:focus-visible {
    outline: none;
  }
  .org-item:focus-visible > .org-card {
    outline: 3px solid var(--ring);
    outline-offset: 3px;
  }
  .root-lane {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    right: 0.5rem;
    z-index: 30;
    padding: 0.5rem;
    border: 2px dashed var(--border-strong);
    border-radius: 0.75rem;
    background: var(--surface);
    color: var(--muted-foreground);
    font-size: 0.8125rem;
    font-weight: 600;
    text-align: center;
  }
  .root-lane.over {
    border-color: var(--ring);
    color: var(--foreground);
    background: var(--accent);
  }

  /* Narrow screens: indented outline with a left rule. */
  .org-list .org-list {
    margin-left: 1.25rem;
    padding-left: 1rem;
    border-left: 2px solid var(--border-strong);
  }
  .org-item {
    margin-top: 0.75rem;
  }
  .org-root > .org-item + .org-item {
    margin-top: 2rem;
  }
  .org-card.drop-before::before {
    top: -0.5rem;
  }

  /* Desktop: pannable/zoomable canvas with a vertical stem and a horizontal bus. */
  @media (min-width: 768px) {
    .viewport {
      overflow: hidden;
      max-height: none;
      cursor: grab;
      touch-action: none;
    }
    .viewport.panning {
      cursor: grabbing;
      user-select: none;
    }
    .canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: max-content;
      padding: 0;
      transform-origin: 0 0;
      transform: translate(var(--tx), var(--ty)) scale(var(--s));
    }
    .org-list {
      display: flex;
      justify-content: center;
      position: relative;
    }
    .org-root {
      flex-wrap: wrap;
      gap: 2.5rem;
    }
    .org-list .org-list {
      margin-left: 0;
      padding: 1.5rem 0 0;
      border-left: 0;
    }
    .org-list .org-list::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      height: 1.5rem;
      border-left: 2px solid var(--border-strong);
    }
    .org-item {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin: 0;
      padding: 1.5rem 0.5rem 0;
    }
    .org-root > .org-item,
    .org-root > .org-item + .org-item {
      margin: 0;
      padding-top: 0;
    }
    .org-card {
      width: 15rem;
    }
    .org-card.drop-before::before,
    .org-card.drop-after::after {
      top: -0.25rem;
      bottom: -0.25rem;
      left: auto;
      right: auto;
      width: 4px;
      height: auto;
    }
    .org-card.drop-before::before {
      left: -0.6rem;
    }
    .org-card.drop-after::after {
      right: -0.6rem;
    }
    .org-list .org-list > .org-item::before,
    .org-list .org-list > .org-item::after {
      content: '';
      position: absolute;
      top: 0;
      right: 50%;
      width: 50%;
      height: 1.5rem;
      border-top: 2px solid var(--border-strong);
    }
    .org-list .org-list > .org-item::after {
      right: auto;
      left: 50%;
      border-left: 2px solid var(--border-strong);
    }
    .org-list .org-list > .org-item:only-child::before {
      display: none;
    }
    .org-list .org-list > .org-item:only-child::after {
      border-top: 0;
    }
    .org-list .org-list > .org-item:first-child::before,
    .org-list .org-list > .org-item:last-child::after {
      border-top: 0;
    }
    .org-list .org-list > .org-item:last-child::before {
      border-right: 2px solid var(--border-strong);
      border-radius: 0 0.5rem 0 0;
    }
    .org-list .org-list > .org-item:first-child::after {
      border-radius: 0.5rem 0 0 0;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .org-card {
      transition:
        box-shadow 150ms,
        opacity 150ms;
    }
  }
</style>
