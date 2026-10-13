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
    applyPlacements,
    buildOrgTree,
    canDrop,
    invertPlacements,
    keyboardMove,
    matchMembers,
    moveRelative,
    moveToRoot,
    nextOrder,
    positionOf,
    removeMember,
    siblingsOf,
    type DropPosition,
    type KeyboardMove,
    type OrgMember,
    type OrgNode,
    type OrgPlacement,
  } from '@/lib/org-tree';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { append, parseActionError, primaryButtonClass, secondaryButtonClass, type FormErrors } from '../shared/form-utils';
  import MemberInspector, { type MemberValues } from './MemberInspector.svelte';

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

  interface HistoryEntry {
    forward: OrgPlacement[];
    back: OrgPlacement[];
  }
  interface DropState {
    id: number | null;
    position: DropPosition | 'root';
    ok: boolean;
  }

  const MIN_SCALE = 0.25;
  const MAX_SCALE = 2;
  const DESKTOP = '(min-width: 768px)';

  // `members` is what is drawn (optimistic); `confirmed` mirrors what the server has accepted.
  let members = $state.raw<OrgMember[]>(untrack(() => initialMembers.map((m) => ({ ...m }))));
  let confirmed: OrgMember[] = members;

  let selectedId = $state<number | null>(null);
  let focusId = $state<number | null>(null);
  let hoverId = $state<number | null>(null);
  let creating = $state<{ parentId: number | null; afterId: number | null; order: number; nonce: number } | null>(null);
  let nonce = 0;
  let renamingId = $state<number | null>(null);
  let renameValue = $state('');
  let query = $state('');
  let announcement = $state('');
  let undoStack = $state.raw<HistoryEntry[]>([]);
  let redoStack = $state.raw<HistoryEntry[]>([]);

  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  let panning = $state(false);
  let autoFit = true;

  let dragId = $state<number | null>(null);
  let drop = $state<DropState | null>(null);

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
  const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  function announce(text: string) {
    announcement = announcement === text ? `${text}\u00a0` : text;
  }

  // ---------------------------------------------------------------- canvas

  function fit() {
    if (!viewport || !content || !isDesktop()) return;
    const width = content.offsetWidth;
    const height = content.offsetHeight;
    if (width === 0 || height === 0) return;
    const next = clampScale(Math.min(1, (viewport.clientWidth - 48) / width, (viewport.clientHeight - 96) / height));
    scale = next;
    tx = (viewport.clientWidth - width * next) / 2;
    ty = Math.max(56, (viewport.clientHeight - height * next) / 2);
  }

  function zoomBy(factor: number, clientX?: number, clientY?: number) {
    if (!viewport) return;
    autoFit = false;
    const rect = viewport.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const next = clampScale(scale * factor);
    const k = next / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = next;
  }

  function manualFit() {
    autoFit = false;
    fit();
  }

  /** Pans so `el` is inside the viewport (or centred when `center`). */
  function reveal(el: HTMLElement, center = false) {
    if (!viewport) return;
    if (!isDesktop()) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const v = viewport.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const inside = r.left >= v.left + 16 && r.right <= v.right - 16 && r.top >= v.top + 56 && r.bottom <= v.bottom - 16;
    if (inside && !center) return;
    tx += v.left + v.width / 2 - (r.left + r.width / 2);
    ty += v.top + v.height / 2 - (r.top + r.height / 2);
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
      autoFit = false;
      if (event.ctrlKey || event.metaKey) zoomBy(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
      else {
        tx -= event.deltaX;
        ty -= event.deltaY;
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // Fit once the first layout (fonts, photos) settles; stops as soon as the user interacts.
    const observer = new ResizeObserver(() => {
      if (autoFit) fit();
    });
    observer.observe(content);
    fit();
    return () => {
      el.removeEventListener('wheel', onWheel);
      observer.disconnect();
    };
  });

  let pan: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;

  function onPanDown(event: PointerEvent) {
    autoFit = false;
    if (event.button !== 0 || !isDesktop() || !viewport) return;
    if ((event.target as HTMLElement).closest('[data-testid="org-card"], button, input, a')) return;
    pan = { x: event.clientX, y: event.clientY, tx, ty, moved: false };
    viewport.setPointerCapture(event.pointerId);
  }

  function onPanMove(event: PointerEvent) {
    if (!pan) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (!pan.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      pan.moved = true;
      panning = true;
    }
    if (pan.moved) {
      tx = pan.tx + dx;
      ty = pan.ty + dy;
    }
  }

  function onPanUp() {
    if (!pan) return;
    const moved = pan.moved;
    pan = null;
    panning = false;
    if (!moved && !creating) selectedId = null;
  }

  /** The browser may scroll the clipped canvas to reveal a focused card; the transform is the only offset. */
  function onViewportScroll() {
    if (viewport && isDesktop()) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  }

  // ------------------------------------------------------------ persistence

  let generation = 0;
  let inflight: Promise<void> = Promise.resolve();

  function enqueue(placements: OrgPlacement[]) {
    const mine = generation;
    inflight = inflight.then(async () => {
      if (mine !== generation) return;
      const { error } = await actions.members.reorder({ departmentId, placements });
      if (error) {
        generation += 1;
        members = confirmed;
        undoStack = [];
        redoStack = [];
        toast.error(parseActionError(error).message || 'The change could not be saved and was reverted.');
        announce('The change could not be saved and was reverted.');
        return;
      }
      confirmed = applyPlacements(confirmed, placements);
    });
  }

  function sync(change: (list: OrgMember[]) => OrgMember[]) {
    members = change(members);
    confirmed = change(confirmed);
  }

  function describe(id: number): string {
    const { index, count, level, parentId } = positionOf(members, id);
    const parent = parentId === null ? null : byId.get(parentId);
    const name = byId.get(id)?.name ?? 'Member';
    return `${name} moved to position ${index} of ${count} ${parent ? `under ${parent.name}` : 'at the top level'}, level ${level}.`;
  }

  /** Optimistically applies a structure change, records it for undo and queues it for saving. */
  function restructure(placements: OrgPlacement[] | null, id: number): boolean {
    if (!placements || placements.length === 0) return false;
    undoStack = [...undoStack, { forward: placements, back: invertPlacements(members, placements) }];
    redoStack = [];
    members = applyPlacements(members, placements);
    enqueue(placements);
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
    const entry = undoStack.at(-1);
    if (!entry) return;
    void keepFocus(() => {
      undoStack = undoStack.slice(0, -1);
      redoStack = [...redoStack, entry];
      members = applyPlacements(members, entry.back);
      enqueue(entry.back);
      announce('Undid the last structure change.');
    });
  }

  function redo() {
    const entry = redoStack.at(-1);
    if (!entry) return;
    void keepFocus(() => {
      redoStack = redoStack.slice(0, -1);
      undoStack = [...undoStack, entry];
      members = applyPlacements(members, entry.forward);
      enqueue(entry.forward);
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
    await inflight;
    if (creating) return createMember(values);
    const current = confirmed.find((m) => m.id === selectedId);
    if (!current) return { fields: {}, message: 'This member no longer exists.' };
    const { data, error } = await actions.members.update(formFor({ id: current.id, ...values }));
    if (error) return parseActionError(error);
    const patch = { name: values.name, role: values.role, parentId: values.parentId, order: values.order, imageUrl: data.imageUrl };
    if (patch.parentId !== current.parentId || patch.order !== current.order) {
      undoStack = [];
      redoStack = [];
    }
    sync((list) => list.map((m) => (m.id === current.id ? { ...m, ...patch } : m)));
    toast.success('Member updated.');
    announce(`${values.name} updated.`);
    return null;
  }

  async function createMember(values: MemberValues): Promise<FormErrors | null> {
    const context = creating;
    const { data, error } = await actions.members.create(formFor(values));
    if (error) return parseActionError(error);
    const created: OrgMember = {
      id: data.id,
      name: values.name,
      role: values.role,
      parentId: values.parentId,
      order: data.order,
      imageUrl: data.imageUrl,
    };
    sync((list) => [...list, created]);
    creating = null;
    selectedId = created.id;
    toast.success(`${created.name} added.`);
    // "Add peer" slots the new member right after the card it was added beside.
    if (context?.afterId != null && values.parentId === context.parentId && values.order === context.order) {
      restructure(moveRelative(members, created.id, context.afterId, 'after'), created.id);
    } else announce(`${created.name} added.`);
    void focusMember(created.id);
    return null;
  }

  async function commitRename(id: number) {
    if (renamingId !== id) return;
    const name = renameValue.trim();
    renamingId = null;
    const member = byId.get(id);
    if (member && name && name !== member.name) {
      const previous = member.name;
      members = members.map((m) => (m.id === id ? { ...m, name } : m));
      await inflight;
      const current = confirmed.find((m) => m.id === id);
      const { error } = current
        ? await actions.members.update(formFor({ ...current, name }))
        : { error: { message: 'This member no longer exists.' } };
      if (error) {
        members = members.map((m) => (m.id === id ? { ...m, name: previous } : m));
        toast.error(parseActionError(error).fields.name || parseActionError(error).message);
      } else {
        sync((list) => list.map((m) => (m.id === id ? { ...m, name } : m)));
        announce(`Renamed to ${name}.`);
      }
    }
    void focusMember(id);
  }

  function startRename(id: number) {
    const member = byId.get(id);
    if (!member) return;
    renameValue = member.name;
    renamingId = id;
  }

  function requestDelete(member: OrgMember) {
    deleteTarget = member;
    deleteOpen = true;
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target) return;
    deleting = true;
    await inflight;
    const { error } = await actions.members.delete({ departmentId, id: target.id });
    deleting = false;
    deleteOpen = false;
    if (error) {
      toast.error(parseActionError(error).message || 'The member could not be deleted.');
      return;
    }
    const manager = target.parentId;
    sync((list) => removeMember(list, target.id));
    undoStack = [];
    redoStack = [];
    if (selectedId === target.id) selectedId = manager !== null && byId.has(manager) ? manager : null;
    toast.success(`${target.name} removed.`);
    announce(`${target.name} removed. Direct reports moved up.`);
    if (selectedId !== null) void focusMember(selectedId);
  }

  // -------------------------------------------------------------- selection

  function selectMember(id: number | null) {
    creating = null;
    selectedId = id;
  }

  function startCreate(parentId: number | null, afterId: number | null) {
    creating = { parentId, afterId, order: nextOrder(members, parentId), nonce: ++nonce };
  }

  function closeInspector() {
    const id = selectedId;
    creating = null;
    selectedId = null;
    if (id !== null) void focusMember(id);
  }

  // ------------------------------------------------------------- tree input

  const ALT_MOVES: Record<string, { move: KeyboardMove; label: string }> = {
    ArrowUp: { move: 'up', label: 'earlier among its siblings' },
    ArrowDown: { move: 'down', label: 'later among its siblings' },
    ArrowLeft: { move: 'out', label: 'up a level' },
    ArrowRight: { move: 'in', label: 'under the previous sibling' },
  };

  function onItemKey(event: KeyboardEvent, id: number) {
    if (event.target !== event.currentTarget) return;
    const member = byId.get(id);
    if (!member) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && ALT_MOVES[event.key]) {
      event.preventDefault();
      const { move, label } = ALT_MOVES[event.key];
      if (!restructure(keyboardMove(members, id, move), id)) announce(`${member.name} cannot move ${label}.`);
      void focusMember(id);
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = flat.indexOf(id);
    const go = (target: number | undefined) => {
      if (target === undefined) return;
      event.preventDefault();
      void focusMember(target);
    };
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        selectMember(id);
        void tick().then(() => document.getElementById('member-name')?.focus());
        break;
      case 'F2':
        event.preventDefault();
        startRename(id);
        break;
      case 'Delete':
        event.preventDefault();
        requestDelete(member);
        break;
      case 'ArrowDown':
        go(flat[index + 1]);
        break;
      case 'ArrowUp':
        go(flat[index - 1]);
        break;
      case 'ArrowRight':
        go(siblingsOf(members, id)[0]?.id);
        break;
      case 'ArrowLeft':
        go(member.parentId ?? undefined);
        break;
      case 'Home':
        go(flat[0]);
        break;
      case 'End':
        go(flat.at(-1));
        break;
    }
  }

  function onRootKey(event: KeyboardEvent) {
    autoFit = false;
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
    const ids = flat.filter((id) => matches.has(id));
    if (ids.length === 0) return;
    const next = ids[(ids.indexOf(focusId ?? -1) + 1) % ids.length];
    void focusMember(next, true);
  }

  // ----------------------------------------------------------- drag and drop

  function zoneOf(event: DragEvent, card: HTMLElement): DropPosition {
    const rect = card.getBoundingClientRect();
    const ratio = isDesktop() ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
    return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'child';
  }

  function setDrop(next: DropState | null) {
    if (drop?.id !== next?.id || drop?.position !== next?.position || drop?.ok !== next?.ok) drop = next;
  }

  function onCardDragStart(event: DragEvent, id: number) {
    dragId = id;
    hoverId = null;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(id));
    }
  }

  function onCardDragEnd() {
    dragId = null;
    drop = null;
  }

  function onCardDragOver(event: DragEvent, id: number) {
    if (dragId === null) return;
    const position = zoneOf(event, event.currentTarget as HTMLElement);
    const ok = canDrop(members, dragId, id);
    setDrop({ id, position, ok });
    if (ok) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    } else if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
  }

  /** The browser fires `dragenter` on the new target before `dragleave` on the old one: only clear our own state. */
  function onCardDragLeave(event: DragEvent, id: number) {
    if (drop?.id === id && !(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) drop = null;
  }

  function onCardDrop(event: DragEvent, id: number) {
    if (dragId === null) return;
    event.preventDefault();
    const moving = dragId;
    const position = zoneOf(event, event.currentTarget as HTMLElement);
    dragId = null;
    drop = null;
    restructure(moveRelative(members, moving, id, position), moving);
    void focusMember(moving);
  }

  function onLaneDragOver(event: DragEvent) {
    if (dragId === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    setDrop({ id: null, position: 'root', ok: true });
  }

  function onLaneDrop(event: DragEvent) {
    if (dragId === null) return;
    event.preventDefault();
    const moving = dragId;
    dragId = null;
    drop = null;
    restructure(moveToRoot(members, moving), moving);
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
          onclick={() => selectMember(m.id)}
          ondblclick={(event) => {
            if (!(event.target as HTMLElement).closest('button, input')) startRename(m.id);
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
                bind:value={renameValue}
                type="text"
                maxlength="255"
                aria-label="Rename {m.name}"
                class="w-full rounded border border-border-strong bg-surface px-1.5 py-0.5 text-sm font-semibold text-foreground outline-none focus:border-brand-600 focus:ring-2 focus:ring-ring/40"
                onkeydown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void commitRename(m.id);
                  } else if (event.key === 'Escape') {
                    renamingId = null;
                    void focusMember(m.id);
                  }
                }}
                onblur={() => void commitRename(m.id)}
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
                  selectMember(m.id);
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
                selectedId = m.id;
                startCreate(m.id, null);
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
                selectedId = m.id;
                startCreate(m.parentId, m.id);
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
    <button type="button" class={primaryButtonClass} onclick={() => startCreate(selectedId, null)}>
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
      <button type="button" class={toolButton} onclick={undo} disabled={undoStack.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)">
        <Undo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={toolButton} onclick={redo} disabled={redoStack.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
        <Redo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="hidden items-center gap-2 md:flex" role="group" aria-label="Zoom">
        <button type="button" class={toolButton} onclick={() => zoomBy(1 / 1.2)} aria-label="Zoom out" title="Zoom out (-)">
          <ZoomOut class="h-4 w-4" aria-hidden="true" />
        </button>
        <span class="w-10 text-center text-xs tabular-nums text-muted-foreground" data-testid="zoom-level">{Math.round(scale * 100)}%</span>
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
      style="--tx:{tx}px;--ty:{ty}px;--s:{scale}"
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
          ondragleave={() => drop?.position === 'root' && setDrop(null)}
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
          <button type="button" class={primaryButtonClass} onclick={() => startCreate(null, null)}>
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
    flex: 1 1 0;
    min-width: 0;
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
