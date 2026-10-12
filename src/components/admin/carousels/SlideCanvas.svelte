<script lang="ts">
  import { ImagePlus } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    WIDTH_HANDLES,
    HANDLES,
    clampToSlide,
    patchLayer,
    resizeBox,
    snapMove,
    type Box,
    type Guides,
    type Handle,
  } from '@/lib/carousel-editor';
  import type { Layer } from '@/lib/carousel-overlay';
  import SlideStage from './SlideStage.svelte';

  let {
    imageUrl,
    layers,
    selectedId,
    showVisibleArea = true,
    onselect,
    onlive,
    oncommit,
  }: {
    imageUrl: string | null;
    layers: Layer[];
    selectedId: string | null;
    showVisibleArea?: boolean;
    onselect: (id: string | null) => void;
    /** Called continuously while dragging; replaces the current layers without an undo step. */
    onlive: (layers: Layer[]) => void;
    /** Called once when a drag ends; `base` is the layers before the drag (becomes the undo step). */
    oncommit: (base: Layer[]) => void;
  } = $props();

  // Share of the slide height still visible on a 1440 px wide screen (600 px hero, cover-cropped 16:9).
  const VISIBLE_BAND = (600 / ((1440 * 9) / 16)) * 100;
  const CROP = (100 - VISIBLE_BAND) / 2;
  const CURSOR: Record<Handle, string> = {
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
  };

  let stage = $state<HTMLDivElement | null>(null);
  let boxes = $state.raw<Record<string, Box>>({});
  let hoverId = $state<string | null>(null);
  let guides = $state.raw<Guides>({ v: [], h: [] });
  let dragging = $state(false);

  const selected = $derived(layers.find((layer) => layer.id === selectedId) ?? null);
  const selectedBox = $derived(selectedId ? (boxes[selectedId] ?? null) : null);
  const hoverBox = $derived(hoverId && hoverId !== selectedId ? (boxes[hoverId] ?? null) : null);
  const handles = $derived(!selected ? [] : selected.type === 'text' ? WIDTH_HANDLES : selected.type === 'shape' || selected.type === 'image' ? HANDLES : []);

  /** Reads each layer's real box (text height is automatic) as percentages of the stage. */
  function measure() {
    if (!stage) return;
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    const next: Record<string, Box> = {};
    for (const element of stage.querySelectorAll<HTMLElement>('[data-layer-id]')) {
      next[element.dataset.layerId as string] = {
        x: (element.offsetLeft / width) * 100,
        y: (element.offsetTop / height) * 100,
        w: (element.offsetWidth / width) * 100,
        h: (element.offsetHeight / height) * 100,
      };
    }
    boxes = next;
  }

  $effect(() => {
    void layers; // re-measure after every DOM update caused by layer changes
    measure();
  });

  onMount(() => {
    if (!stage) return;
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  });

  interface Drag {
    kind: 'move' | 'resize';
    id: string;
    handle?: Handle;
    startX: number;
    startY: number;
    base: Layer[];
    start: Box;
    width: number;
    height: number;
    moved: boolean;
  }
  let drag: Drag | null = null;

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !stage) return;
    const target = event.target as HTMLElement;
    const handleEl = target.closest<HTMLElement>('[data-handle]');
    const layerEl = target.closest<HTMLElement>('[data-layer-id]');
    const id = handleEl ? selectedId : (layerEl?.dataset.layerId ?? null);
    if (!id || !boxes[id]) {
      onselect(null);
      return;
    }
    if (!handleEl) onselect(id);
    const rect = stage.getBoundingClientRect();
    drag = {
      kind: handleEl ? 'resize' : 'move',
      id,
      handle: handleEl?.dataset.handle as Handle | undefined,
      startX: event.clientX,
      startY: event.clientY,
      base: layers,
      start: boxes[id],
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    stage.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag) {
      const layerEl = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]');
      hoverId = layerEl?.dataset.layerId ?? null;
      return;
    }
    const { startX, startY, start, id, base } = drag;
    if (!drag.moved && Math.hypot(event.clientX - startX, event.clientY - startY) < 3) return;
    drag.moved = true;
    dragging = true;
    const dx = ((event.clientX - startX) / drag.width) * 100;
    const dy = ((event.clientY - startY) / drag.height) * 100;

    if (drag.kind === 'move') {
      const others = base.filter((layer) => layer.id !== id && boxes[layer.id]).map((layer) => boxes[layer.id]);
      const raw = { ...start, x: start.x + dx, y: start.y + dy };
      const snapped = event.altKey ? { x: raw.x, y: raw.y, guides: { v: [], h: [] } } : snapMove(raw, others);
      const placed = clampToSlide({ ...start, x: snapped.x, y: snapped.y });
      guides = snapped.guides;
      onlive(patchLayer(base, id, { x: placed.x, y: placed.y }));
      return;
    }

    const layer = base.find((item) => item.id === id);
    if (!layer || !drag.handle) return;
    const box = resizeBox(start, drag.handle, dx, dy, {
      lockAspect: layer.type === 'image' || event.shiftKey,
      aspect: start.w / start.h,
    });
    onlive(patchLayer(base, id, layer.type === 'text' ? { x: box.x, w: box.w } : { x: box.x, y: box.y, w: box.w, h: box.h }));
  }

  function endDrag(event: PointerEvent) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    dragging = false;
    guides = { v: [], h: [] };
    stage?.releasePointerCapture?.(event.pointerId);
    if (finished.moved) oncommit(finished.base);
  }

  function onPointerLeave() {
    hoverId = null;
  }

  function onFocusIn(event: FocusEvent) {
    const id = (event.target as HTMLElement).closest<HTMLElement>('[data-layer-id]')?.dataset.layerId;
    if (id && id !== selectedId) onselect(id);
  }

  $effect(() => {
    if (!stage) return;
    const node = stage;
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', endDrag);
    node.addEventListener('pointercancel', endDrag);
    node.addEventListener('pointerleave', onPointerLeave);
    node.addEventListener('focusin', onFocusIn);
    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', endDrag);
      node.removeEventListener('pointercancel', endDrag);
      node.removeEventListener('pointerleave', onPointerLeave);
      node.removeEventListener('focusin', onFocusIn);
    };
  });

  function boxStyle(box: Box, rotation = 0) {
    return `left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;${rotation ? `transform:rotate(${rotation}deg);` : ''}`;
  }

  function handleStyle(handle: Handle) {
    const left = handle.includes('w') ? 0 : handle.includes('e') ? 100 : 50;
    const top = handle.includes('n') ? 0 : handle.includes('s') ? 100 : 50;
    return `left:${left}%;top:${top}%;cursor:${CURSOR[handle]};`;
  }

  const handleLabel: Record<Handle, string> = {
    n: 'top',
    s: 'bottom',
    e: 'right',
    w: 'left',
    ne: 'top right',
    nw: 'top left',
    se: 'bottom right',
    sw: 'bottom left',
  };
</script>

<div class="overflow-hidden rounded-lg border border-border-strong shadow-brand-md">
  <SlideStage
    bind:element={stage}
    {imageUrl}
    {layers}
    interactive
    label="Slide canvas. Tab moves between layers; arrow keys move the selected layer."
  >
    {#if !imageUrl}
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-white">
        <ImagePlus class="h-8 w-8" aria-hidden="true" />
        <p class="text-sm font-semibold">Add a slide image to start designing</p>
        <p class="text-xs text-white/80">Use “Slide image” in the panel on the right.</p>
      </div>
    {/if}

    {#if showVisibleArea}
      <div class="pointer-events-none absolute inset-x-0 top-0 z-40 border-b border-dashed border-white/80 bg-brand-950/45" style="height:{CROP}%"></div>
      <div class="pointer-events-none absolute inset-x-0 bottom-0 z-40 border-t border-dashed border-white/80 bg-brand-950/45" style="height:{CROP}%"></div>
    {/if}

    {#if hoverBox && !dragging}
      <div class="pointer-events-none absolute z-40 border border-brand-400" style={boxStyle(hoverBox)}></div>
    {/if}

    {#each guides.v as x (x)}
      <div class="pointer-events-none absolute inset-y-0 z-50 w-px bg-gold-400" style="left:{x}%"></div>
    {/each}
    {#each guides.h as y (y)}
      <div class="pointer-events-none absolute inset-x-0 z-50 h-px bg-gold-400" style="top:{y}%"></div>
    {/each}

    {#if selected && selectedBox}
      <div class="pointer-events-none absolute z-50 border-2 border-brand-400" style={boxStyle(selectedBox, selected.rotation)}>
        {#each handles as handle (handle)}
          <span
            data-handle={handle}
            role="presentation"
            title="Resize {handleLabel[handle]}"
            class="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-brand-500 bg-white before:absolute before:-inset-2 before:content-['']"
            style={handleStyle(handle)}
          ></span>
        {/each}
      </div>
    {/if}
  </SlideStage>
</div>
