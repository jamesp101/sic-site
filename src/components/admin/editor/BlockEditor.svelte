<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    CircleAlert,
    Copy,
    CornerDownRight,
    CornerUpLeft,
    Eye,
    Layers,
    Maximize2,
    Minimize2,
    Monitor,
    PanelLeft,
    PanelRight,
    Redo2,
    Shapes,
    Smartphone,
    Tablet,
    Trash,
    Undo2,
    WandSparkles as Wand,
  } from '@lucide/svelte';
  import { onMount, untrack } from 'svelte';
  import { setKeyboardDragTrigger } from 'svelte-dnd-action';
  import {
    canContain,
    canPlace,
    createBlock,
    createDocument,
    duplicateBlock,
    findBlock,
    flatten,
    insertBlock,
    insertionPoint,
    isBlockDocument,
    moveBlock,
    removeBlock,
    serializeDocument,
    setChildren,
    shiftBlock,
    updateBlock,
  } from '@/lib/blocks/document';
  import { markdownToBlocks } from '@/lib/blocks/from-markdown';
  import { renderBlocks } from '@/lib/blocks/render';
  import { parseBlockDocument, validateDocument } from '@/lib/blocks/schema';
  import { TEMPLATES, type BlockTemplate } from '@/lib/blocks/templates';
  import { BLOCK_META, LIMITS, type Block, type BlockType } from '@/lib/blocks/types';
  import { buildSrcdoc, CanvasController, type CanvasHost, type CanvasSource, type DropTarget } from './canvas';
  import { History } from './history';
  import Inspector from './Inspector.svelte';
  import LayerList from './LayerList.svelte';
  import Palette from './Palette.svelte';

  let {
    value = $bindable(''),
    id = 'content',
    label = 'Content',
    error = '',
    context = 'post',
  }: {
    /** Stored content: a block document (JSON string), legacy Markdown, or empty. */
    value?: string;
    id?: string;
    label?: string;
    error?: string;
    /** Where the content is shown on the public site (decides the canvas column width). */
    context?: 'post' | 'section';
  } = $props();

  // ---------------------------------------------------------------------------------------------
  // Document state
  // ---------------------------------------------------------------------------------------------

  const initialValue = untrack(() => value);

  function load(raw: string): Block[] {
    if (!raw.trim()) return [];
    if (isBlockDocument(raw)) {
      const parsed = parseBlockDocument(raw);
      if (parsed.ok) return parsed.document.blocks;
      // Stored document no longer validates (hand-edited?): open it as-is so nothing is lost; issues are listed.
      const loose: unknown = JSON.parse(raw);
      if (typeof loose === 'object' && loose !== null && 'blocks' in loose && Array.isArray(loose.blocks)) {
        return loose.blocks as Block[];
      }
    }
    // Legacy Markdown / MDX-lite opens as a single Markdown block.
    return [createBlock('markdown', { source: raw })];
  }

  const initialBlocks = load(initialValue);
  let blocks = $state.raw<Block[]>(initialBlocks);
  let selectedId = $state<string | null>(null);
  const history = new History<Block[]>(initialBlocks);
  let historyTick = $state(0);
  const canUndo = $derived(historyTick >= 0 && history.canUndo);
  const canRedo = $derived(historyTick >= 0 && history.canRedo);

  function emit() {
    value =
      blocks === initialBlocks ? initialValue : blocks.length ? serializeDocument(createDocument(blocks)) : '';
  }

  function apply(next: Block[], options: { select?: string | null; key?: string } = {}) {
    if (next === blocks) return;
    history.push(next, options.key ?? null);
    blocks = next;
    historyTick++;
    if (options.select !== undefined) selectedId = options.select;
    else if (selectedId && !findBlock(next, selectedId)) selectedId = null;
    layersRevision++;
    emit();
  }

  function restore(snapshot: Block[] | null) {
    if (!snapshot) return;
    blocks = snapshot;
    historyTick++;
    if (selectedId && !findBlock(snapshot, selectedId)) selectedId = null;
    layersRevision++;
    emit();
  }

  const undo = () => restore(history.undo());
  const redo = () => restore(history.redo());

  const selected = $derived(selectedId ? findBlock(blocks, selectedId) : null);
  const flat = $derived(flatten(blocks));
  const hasLegacy = $derived(flat.some(({ block }) => block.type === 'markdown' && block.props.source.trim() !== ''));
  const validation = $derived(validateDocument(createDocument(blocks)));
  const issues = $derived(validation.ok ? [] : validation.issues);

  const crumbs = $derived.by(() => {
    const trail: string[] = [];
    let current = selected;
    while (current) {
      trail.unshift(BLOCK_META[current.block.type].label);
      current = current.parentId ? findBlock(blocks, current.parentId) : null;
    }
    return trail;
  });

  // ---------------------------------------------------------------------------------------------
  // Editing operations
  // ---------------------------------------------------------------------------------------------

  let announcement = $state('');
  let layersRevision = $state(0);

  function announce(message: string) {
    announcement = '';
    queueMicrotask(() => (announcement = message));
  }

  function select(next: string | null) {
    selectedId = next;
    if (next) canvas?.scrollToBlock(next);
  }

  function indexIn(tree: Block[], parentId: string | null, beforeId: string | null): number {
    const siblings = parentId === null ? tree : (findBlock(tree, parentId)?.block.children ?? []);
    if (beforeId === null) return siblings.length;
    const index = siblings.findIndex((block) => block.id === beforeId);
    return index === -1 ? siblings.length : index;
  }

  function insertNew(type: BlockType, target?: DropTarget) {
    const block = createBlock(type);
    const point = target
      ? { parentId: target.parentId, index: indexIn(blocks, target.parentId, target.beforeId) }
      : insertionPoint(blocks, selectedId, type);
    if (!canPlace(blocks, block, point.parentId)) {
      announce(`${BLOCK_META[type].label} cannot be placed there.`);
      return;
    }
    apply(insertBlock(blocks, point.parentId, point.index, block), { select: block.id });
    announce(`${BLOCK_META[type].label} added.`);
  }

  function updateProps(blockId: string, patch: Record<string, unknown>, coalesce = true) {
    let next = updateBlock(blocks, blockId, patch);
    const location = findBlock(next, blockId);
    if (location?.block.type === 'columns' && 'count' in patch) {
      // Keep one stack per column; never delete content when reducing the count.
      const count = Number(patch.count);
      const children = location.block.children ?? [];
      if (children.length < count) {
        const extra = Array.from({ length: count - children.length }, () =>
          createBlock('row', { direction: 'column', gap: 'sm', align: 'stretch' }),
        );
        next = setChildren(next, blockId, [...children, ...extra]);
      }
    }
    apply(next, { key: coalesce ? `props:${blockId}:${Object.keys(patch).join(',')}` : undefined });
  }

  function duplicate() {
    if (!selectedId) return;
    const result = duplicateBlock(blocks, selectedId);
    if (!result) return;
    apply(result.blocks, { select: result.id });
    announce('Element duplicated.');
  }

  function remove() {
    if (!selectedId) return;
    const location = findBlock(blocks, selectedId);
    if (!location) return;
    const neighbour = location.siblings[location.index + 1] ?? location.siblings[location.index - 1];
    apply(removeBlock(blocks, selectedId), { select: neighbour?.id ?? location.parentId });
    announce('Element deleted.');
  }

  function shift(delta: -1 | 1) {
    if (!selectedId) return;
    const next = shiftBlock(blocks, selectedId, delta);
    if (next === blocks) return;
    apply(next);
    announce(delta < 0 ? 'Moved up.' : 'Moved down.');
  }

  function outdent() {
    const location = selected;
    if (!location?.parentId) return;
    const parent = findBlock(blocks, location.parentId);
    if (!parent) return;
    const next = moveBlock(blocks, location.block.id, parent.parentId, parent.index + 1);
    if (next === blocks) return announce('Cannot move out of this container.');
    apply(next);
    announce('Moved out of the container.');
  }

  function indent() {
    const location = selected;
    if (!location) return;
    const previous = location.siblings.slice(0, location.index)
      .reverse()
      .find((block) => canContain(block.type, location.block.type));
    if (!previous) return announce('There is no container before this element.');
    const next = moveBlock(blocks, location.block.id, previous.id, previous.children?.length ?? 0);
    if (next === blocks) return announce('Cannot move into that container.');
    apply(next);
    announce(`Moved into ${BLOCK_META[previous.type].label}.`);
  }

  function layerMove(blockId: string, parentId: string | null, index: number) {
    const location = findBlock(blocks, blockId);
    if (!location || (location.parentId === parentId && location.index === index)) {
      layersRevision++;
      return;
    }
    const next = moveBlock(blocks, blockId, parentId, index);
    if (next === blocks) {
      layersRevision++;
      announce('That element cannot be placed there.');
      return;
    }
    apply(next, { select: blockId });
  }

  function applyTemplate(template: BlockTemplate) {
    const created = template.create();
    apply(created, { select: created[0]?.id ?? null });
    announce(`${template.label} template added.`);
  }

  function convertMarkdown(blockId: string) {
    const location = findBlock(blocks, blockId);
    if (!location || location.block.type !== 'markdown') return;
    const converted = markdownToBlocks(location.block.props.source);
    if (converted.length === 0) return;
    const siblings = [
      ...location.siblings.slice(0, location.index),
      ...converted,
      ...location.siblings.slice(location.index + 1),
    ];
    apply(setChildren(blocks, location.parentId, siblings), { select: converted[0].id });
    announce('Markdown converted to blocks.');
  }

  function convertAll() {
    let next = blocks;
    let first: string | null = null;
    for (const { block } of flatten(blocks)) {
      if (block.type !== 'markdown') continue;
      const location = findBlock(next, block.id);
      const converted = markdownToBlocks(block.props.source);
      if (!location || converted.length === 0) continue;
      first ??= converted[0].id;
      next = setChildren(next, location.parentId, [
        ...location.siblings.slice(0, location.index),
        ...converted,
        ...location.siblings.slice(location.index + 1),
      ]);
    }
    apply(next, { select: first });
    announce('Markdown converted to blocks.');
  }

  // ---------------------------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------------------------

  function handleKey(event: KeyboardEvent, editing = false) {
    if (previewing) return;
    // Events from the canvas iframe come from another realm, so avoid `instanceof`.
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName ?? '';
    const typing = editing || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (mod && (key === 'z' || key === 'y')) {
      if (typing) return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) redo();
      else undo();
      return;
    }
    if (event.key === 'Escape') {
      if (typing) {
        if (!editing) target?.blur();
        return;
      }
      if (selectedId) select(null);
      else if (fullscreen) fullscreen = false;
      return;
    }
    if (typing) return;

    if (mod && key === 'd') {
      event.preventDefault();
      duplicate();
      return;
    }
    if (event.altKey && event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (event.key === 'ArrowUp') shift(-1);
      else if (event.key === 'ArrowDown') shift(1);
      else if (event.key === 'ArrowLeft') outdent();
      else indent();
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      event.preventDefault();
      remove();
      return;
    }
    if (mod || event.altKey || event.shiftKey) return;
    // The layers list lends arrow keys to the drag & drop library.
    if (target?.closest('[data-editor-layers]') || tag === 'BUTTON') return;

    const position = flat.findIndex(({ block }) => block.id === selectedId);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = flat[position + (event.key === 'ArrowDown' ? 1 : -1)] ?? (position === -1 ? flat[0] : undefined);
      if (next) select(next.block.id);
    } else if (event.key === 'ArrowLeft' && selected?.parentId) {
      event.preventDefault();
      select(selected.parentId);
    } else if (event.key === 'ArrowRight' && selected?.block.children?.[0]) {
      event.preventDefault();
      select(selected.block.children[0].id);
    } else if (event.key === 'Enter' && selectedId) {
      event.preventDefault();
      if (!canvas?.startEdit(selectedId)) inspectorEl?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Canvas
  // ---------------------------------------------------------------------------------------------

  let frame = $state<HTMLIFrameElement>();
  let canvas = $state.raw<CanvasController | null>(null);
  let inspectorEl = $state<HTMLElement>();
  let dragging = $state(false);
  let previewing = $state(false);
  let device = $state<'desktop' | 'tablet' | 'mobile'>('desktop');
  let zoom = $state<'fit' | '0.5' | '0.75' | '1'>('fit');
  let paneWidth = $state(600);
  let paneHeight = $state(480);
  let fullscreen = $state(false);
  let leftOpen = $state(true);
  let rightOpen = $state(true);
  let leftTab = $state<'elements' | 'layers'>('elements');
  let showIssues = $state(false);

  const DEVICE_WIDTH = { desktop: 1024, tablet: 768, mobile: 390 } as const;
  const logicalWidth = $derived(DEVICE_WIDTH[device]);
  const scale = $derived(zoom === 'fit' ? Math.min(1, Math.max(0.3, (paneWidth - 24) / logicalWidth)) : Number(zoom));

  function renderSafe(list: Block[], editor: boolean): string {
    try {
      return renderBlocks(list, { editor });
    } catch {
      return '<p class="text-sm text-destructive">This content could not be displayed.</p>';
    }
  }

  const html = $derived(renderSafe(blocks, !previewing));

  function canDropAt(source: CanvasSource, parentId: string | null): boolean {
    if (source.kind === 'move') {
      const location = findBlock(blocks, source.id);
      return location !== null && canPlace(blocks, location.block, parentId);
    }
    const parent = parentId === null ? null : findBlock(blocks, parentId);
    if (parentId !== null && !parent) return false;
    if (!canContain(parent?.block.type ?? null, source.type)) return false;
    return (parent?.depth ?? 0) + (source.type === 'columns' ? 2 : 1) <= LIMITS.depth;
  }

  function dropAt(source: CanvasSource, target: DropTarget) {
    if (source.kind === 'new') {
      insertNew(source.type, target);
      return;
    }
    const without = removeBlock(blocks, source.id);
    const index = indexIn(without, target.parentId, target.beforeId);
    const next = moveBlock(blocks, source.id, target.parentId, index);
    if (next === blocks) return announce('That element cannot be placed there.');
    apply(next, { select: source.id });
    announce('Element moved.');
  }

  const host: CanvasHost = {
    select: (next) => select(next),
    commitText: (blockId, patch) => updateProps(blockId, patch, false),
    key: (event, editing) => handleKey(event, editing),
    drop: dropAt,
    canDrop: canDropAt,
    dragging: (active) => (dragging = active),
  };

  onMount(() => {
    setKeyboardDragTrigger('space');
    const controller = new CanvasController(frame!, host);
    const isDark = () => document.documentElement.classList.contains('dark');
    const onLoad = () => {
      controller.attach();
      controller.setDark(isDark());
    };
    frame!.addEventListener('load', onLoad);
    frame!.srcdoc = buildSrcdoc({ width: context === 'post' ? 'narrow' : 'wide', dark: isDark() });
    canvas = controller;

    const observer = new MutationObserver(() => controller.setDark(isDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
      frame?.removeEventListener('load', onLoad);
      controller.destroy();
      canvas = null;
      setKeyboardDragTrigger(null);
      document.documentElement.style.overflow = '';
    };
  });

  $effect(() => {
    canvas?.render(html);
  });
  $effect(() => {
    canvas?.setSelected(previewing ? null : selectedId);
  });
  $effect(() => {
    document.documentElement.style.overflow = fullscreen ? 'hidden' : '';
  });

  function beginPaletteDrag(type: BlockType, x: number, y: number) {
    canvas?.beginDrag({ kind: 'new', type, label: BLOCK_META[type].label }, x, y);
  }

  const btn =
    'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40';
  const toggleBtn = (active: boolean) => [btn, active && 'bg-accent text-accent-foreground'];
  const tabBtn = (active: boolean) => [
    'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
    active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
  ];
</script>

<div class="space-y-1.5">
  <p id={`${id}-label`} class="text-sm font-semibold text-foreground">{label}</p>

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    role="group"
    aria-labelledby={`${id}-label`}
    class={[
      'flex flex-col overflow-hidden border border-border-strong bg-surface shadow-brand-sm',
      fullscreen ? 'fixed inset-0 z-50 h-dvh rounded-none' : 'h-[min(78vh,820px)] min-h-[560px] rounded-xl',
    ]}
    onkeydown={(event) => handleKey(event)}
    data-block-editor
  >
    <!-- Toolbar -->
    <div role="toolbar" aria-label="Editor toolbar" class="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface-alt px-2 py-1.5">
      <button type="button" class={btn} aria-label="Undo" title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z Meta+Z" disabled={!canUndo} onclick={undo}>
        <Undo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" disabled={!canRedo} onclick={redo}>
        <Redo2 class="h-4 w-4" aria-hidden="true" />
      </button>
      <span class="mx-1 h-5 w-px bg-border-strong" aria-hidden="true"></span>
      <button type="button" class={btn} aria-label="Duplicate" title="Duplicate (Ctrl+D)" aria-keyshortcuts="Control+D Meta+D" disabled={!selectedId} onclick={duplicate}>
        <Copy class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Delete" title="Delete (Del)" aria-keyshortcuts="Delete" disabled={!selectedId} onclick={remove}>
        <Trash class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Move up" title="Move up (Alt+↑)" aria-keyshortcuts="Alt+ArrowUp" disabled={!selectedId} onclick={() => shift(-1)}>
        <ArrowUp class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Move down" title="Move down (Alt+↓)" aria-keyshortcuts="Alt+ArrowDown" disabled={!selectedId} onclick={() => shift(1)}>
        <ArrowDown class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Move out of container" title="Move out of container (Alt+←)" aria-keyshortcuts="Alt+ArrowLeft" disabled={!selected?.parentId} onclick={outdent}>
        <CornerUpLeft class="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" class={btn} aria-label="Move into previous container" title="Move into previous container (Alt+→)" aria-keyshortcuts="Alt+ArrowRight" disabled={!selectedId} onclick={indent}>
        <CornerDownRight class="h-4 w-4" aria-hidden="true" />
      </button>

      <div class="ml-auto flex flex-wrap items-center gap-0.5">
        {#if issues.length > 0}
          <button
            type="button"
            class="mr-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            aria-expanded={showIssues}
            aria-controls={`${id}-issues`}
            onclick={() => (showIssues = !showIssues)}
          >
            <CircleAlert class="h-4 w-4" aria-hidden="true" />
            {issues.length} {issues.length === 1 ? 'problem' : 'problems'}
          </button>
        {/if}
        <button type="button" class={toggleBtn(device === 'desktop')} aria-label="Desktop width" title="Desktop width" aria-pressed={device === 'desktop'} onclick={() => (device = 'desktop')}>
          <Monitor class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={toggleBtn(device === 'tablet')} aria-label="Tablet width" title="Tablet width" aria-pressed={device === 'tablet'} onclick={() => (device = 'tablet')}>
          <Tablet class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={toggleBtn(device === 'mobile')} aria-label="Mobile width" title="Mobile width" aria-pressed={device === 'mobile'} onclick={() => (device = 'mobile')}>
          <Smartphone class="h-4 w-4" aria-hidden="true" />
        </button>
        <label class="sr-only" for={`${id}-zoom`}>Zoom</label>
        <select
          id={`${id}-zoom`}
          bind:value={zoom}
          class="h-8 rounded-md border border-border bg-surface px-1.5 text-xs text-foreground"
          title="Canvas zoom"
        >
          <option value="fit">Fit</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>
        <span class="mx-1 h-5 w-px bg-border-strong" aria-hidden="true"></span>
        <button type="button" class={toggleBtn(previewing)} aria-label="Preview" title="Preview without editing chrome" aria-pressed={previewing} onclick={() => (previewing = !previewing)}>
          <Eye class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={toggleBtn(leftOpen && !previewing)} aria-label="Toggle elements panel" title="Toggle elements panel" aria-pressed={leftOpen} disabled={previewing} onclick={() => (leftOpen = !leftOpen)}>
          <PanelLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={toggleBtn(rightOpen && !previewing)} aria-label="Toggle inspector panel" title="Toggle inspector panel" aria-pressed={rightOpen} disabled={previewing} onclick={() => (rightOpen = !rightOpen)}>
          <PanelRight class="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" class={btn} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen editor'} onclick={() => (fullscreen = !fullscreen)}>
          {#if fullscreen}<Minimize2 class="h-4 w-4" aria-hidden="true" />{:else}<Maximize2 class="h-4 w-4" aria-hidden="true" />{/if}
        </button>
      </div>
    </div>

    {#if showIssues && issues.length > 0}
      <div id={`${id}-issues`} class="max-h-36 overflow-y-auto border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <ul class="space-y-1">
          {#each issues as issue, index (index)}
            <li>
              {#if issue.blockId}
                <button type="button" class="text-left underline underline-offset-2" onclick={() => { select(issue.blockId ?? null); showIssues = false; }}>{issue.message}</button>
              {:else}
                {issue.message}
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if hasLegacy}
      <div class="flex flex-wrap items-center gap-2 border-b border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs text-foreground">
        <p class="min-w-0 flex-1">
          This content contains <strong>Markdown (legacy)</strong> blocks. It renders as before; keep it, or convert it into editable blocks.
        </p>
        <button type="button" class="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2.5 py-1 font-semibold hover:bg-surface-alt" onclick={convertAll}>
          <Wand class="h-3.5 w-3.5" aria-hidden="true" /> Convert to blocks
        </button>
      </div>
    {/if}

    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <!-- Left: elements + layers -->
      {#if leftOpen && !previewing}
        <div role="group" class="flex max-h-56 shrink-0 flex-col border-b border-border bg-surface lg:max-h-none lg:w-56 lg:border-r lg:border-b-0" aria-label="Elements and layers">
          <div role="tablist" aria-label="Left panel" class="flex gap-1 border-b border-border p-1.5">
            <button type="button" role="tab" id={`${id}-tab-elements`} aria-selected={leftTab === 'elements'} aria-controls={`${id}-panel-left`} class={tabBtn(leftTab === 'elements')} onclick={() => (leftTab = 'elements')}>
              <Shapes class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Elements
            </button>
            <button type="button" role="tab" id={`${id}-tab-layers`} aria-selected={leftTab === 'layers'} aria-controls={`${id}-panel-left`} class={tabBtn(leftTab === 'layers')} onclick={() => (leftTab = 'layers')}>
              <Layers class="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Layers
            </button>
          </div>
          <div id={`${id}-panel-left`} role="tabpanel" aria-labelledby={`${id}-tab-${leftTab}`} class="min-h-0 flex-1 overflow-y-auto p-2">
            {#if leftTab === 'elements'}
              <Palette onadd={(type) => insertNew(type)} onbegindrag={beginPaletteDrag} />
            {:else}
              <div data-editor-layers>
                {#if blocks.length === 0}
                  <p class="px-1 text-xs text-muted-foreground">No elements yet.</p>
                {/if}
                <LayerList
                  {blocks}
                  revision={layersRevision}
                  selectedId={selectedId}
                  onselect={(blockId) => select(blockId)}
                  onmove={layerMove}
                  onhover={(blockId) => canvas?.setHover(blockId)}
                />
                <p class="mt-2 px-1 text-xs text-muted-foreground">Drag to reorder or nest. With the keyboard, focus a row, press Space to lift, arrow keys to move, Space to drop.</p>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Center: canvas -->
      <div class="relative min-h-72 min-w-0 flex-1 overflow-hidden bg-surface-alt" bind:clientWidth={paneWidth} bind:clientHeight={paneHeight}>
        <div class="absolute inset-0 overflow-x-auto overflow-y-hidden">
          <div class="mx-auto overflow-hidden" style:width="{logicalWidth * scale}px" style:height="{paneHeight}px">
            <iframe
              bind:this={frame}
              title="Visual canvas"
              class={['block border-0 bg-background shadow-brand-md', dragging && 'cursor-grabbing']}
              style:width="{logicalWidth}px"
              style:height="{paneHeight / scale}px"
              style:transform="scale({scale})"
              style:transform-origin="top left"
            ></iframe>
          </div>
        </div>

        {#if blocks.length === 0 && !previewing}
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <div class="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-brand-lg" data-editor-empty>
              <h3 class="flex items-center gap-2 text-base font-bold text-foreground">
                <Wand class="h-4 w-4 text-gold-600" aria-hidden="true" /> Start with a template
              </h3>
              <p class="mt-1 text-xs text-muted-foreground">Pick a layout to edit, or add elements one by one from the Elements panel.</p>
              <ul class="mt-3 grid gap-2 sm:grid-cols-2">
                {#each TEMPLATES as template (template.id)}
                  <li>
                    <button
                      type="button"
                      class="h-full w-full rounded-lg border border-border bg-surface-alt p-2.5 text-left transition-colors hover:border-border-strong hover:bg-accent"
                      onclick={() => applyTemplate(template)}
                    >
                      <span class="block text-sm font-semibold text-foreground">{template.label}</span>
                      <span class="mt-0.5 block text-xs text-muted-foreground">{template.description}</span>
                    </button>
                  </li>
                {/each}
              </ul>
              <button type="button" class="mt-3 w-full rounded-lg bg-brand-800 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 dark:bg-gold-500 dark:text-brand-950 dark:hover:bg-gold-400" onclick={() => insertNew('paragraph')}>
                Start with a text block
              </button>
            </div>
          </div>
        {/if}
      </div>

      <!-- Right: inspector -->
      {#if rightOpen && !previewing}
        <div role="group" bind:this={inspectorEl} class="max-h-80 shrink-0 overflow-y-auto border-t border-border bg-surface p-3 lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l" aria-label="Inspector">
          <Inspector block={selected?.block ?? null} onupdate={(blockId, patch) => updateProps(blockId, patch)} onconvert={convertMarkdown} idPrefix={id} />
        </div>
      {/if}
    </div>

    <!-- Status -->
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface-alt px-3 py-1.5 text-xs text-muted-foreground">
      <p class="min-w-0 truncate">{crumbs.length ? crumbs.join(' › ') : 'Nothing selected'}</p>
      <p class="hidden md:block">
        <kbd class="font-sans font-semibold">Del</kbd> delete · <kbd class="font-sans font-semibold">Ctrl+D</kbd> duplicate · <kbd class="font-sans font-semibold">Ctrl+Z</kbd> undo · <kbd class="font-sans font-semibold">Alt+↑↓</kbd> move · <kbd class="font-sans font-semibold">Enter</kbd> edit text
      </p>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{announcement}</p>
  </div>

  {#if error}
    <p id={`${id}-error`} class="text-xs text-destructive" role="alert">{error}</p>
  {/if}
</div>
