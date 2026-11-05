<script lang="ts">
  import { actions } from 'astro:actions';
  import {
    Eye,
    EyeOff,
    ImagePlus,
    Layers as LayersIcon,
    Loader2,
    Monitor,
    MousePointerClick,
    Redo2,
    Save,
    Smartphone,
    Square,
    Tag,
    Type,
    Undo2,
  } from '@lucide/svelte';
  import { navigate } from 'astro:transitions/client';
  import { onMount, tick, untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import { NUDGE, NUDGE_BIG, type Box, type ZMove } from '@/lib/carousel-editor';
  import { measureLayerBox } from '@/lib/carousel-layout';
  import {
    IMAGE_PRESETS,
    MAX_LAYERS,
    TYPE_LABEL,
    defaultLayer,
    layerLabel,
    type Layer,
    type LayerType,
    type MobileOverride,
  } from '@/lib/carousel-overlay';
  import { resolveMobile, slideFocus } from '@/lib/carousel-overlay-mobile';
  import type { DesignerSlide } from '@/lib/server/slides';
  import { SlideDesignerSession, type DesignerPort, type PortResult, type ReorderResult } from '@/lib/slide-designer-session';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { postImage } from '../editor/upload';
  import { append, inputClass, parseActionError, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';
  import LayerInspector from './LayerInspector.svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  import SlideSettings from './SlideSettings.svelte';
  import SlideStrip from './SlideStrip.svelte';

  let {
    slides,
    departments,
    initialId,
    superadmin,
    lockedDepartmentId,
    scopeName = null,
    defaultDepartmentId = null,
  }: {
    slides: DesignerSlide[];
    departments: { id: number; name: string }[];
    initialId: number | null;
    superadmin: boolean;
    lockedDepartmentId: number | null;
    /** Current admin scope label (superadmins), shown under the title. */
    scopeName?: string | null;
    /** Department preselected for a new slide (the scoped department; null = main page). */
    defaultDepartmentId?: number | null;
  } = $props();

  /** Runs an action and hands the session its data, or the parsed error. */
  async function outcome<D, T>(
    pending: Promise<{ data?: D; error?: unknown }>,
    pick: (data: D) => T,
  ): Promise<PortResult<T>> {
    const { data, error } = await pending;
    if (error) {
      const parsed = parseActionError(error);
      return { ok: false, message: parsed.message, fields: parsed.fields };
    }
    return { ok: true, data: pick(data as D) };
  }

  const port: DesignerPort = {
    save(input) {
      const form = new FormData();
      append(form, 'overlay', input.overlay);
      append(form, 'image', input.image);
      form.set('video', input.video);
      if (input.id === null) {
        append(form, 'departmentId', input.departmentId);
        append(form, 'showOnMain', input.showOnMain);
        return outcome(actions.carousels.create(form), (data) => data.slide);
      }
      append(form, 'id', input.id);
      return outcome(actions.carousels.update(form), (data) => data.slide);
    },
    reorder: (ids) => outcome(actions.carousels.reorder({ ids }), () => undefined),
    duplicate: (id) => outcome(actions.carousels.duplicate({ id }), (data) => data.slide),
    placement: (id, patch) => outcome(actions.carousels.placement({ id, ...patch }), (data) => data.slide),
    remove: (id) => outcome(actions.carousels.delete({ id }), () => undefined),
  };

  // The session owns drafts, the open slide, the selected layer, undo history and dirty state; this component renders them.
  const session = new SlideDesignerSession({
    slides: untrack(() => slides),
    initialId: untrack(() => initialId),
    newSlideDepartmentId: untrack(() => lockedDepartmentId ?? defaultDepartmentId),
    port,
    objectUrls: { create: (file) => URL.createObjectURL(file), revoke: (url) => URL.revokeObjectURL(url) },
    onchange: () => (designer = session.view),
  });
  let designer = $state.raw(session.view);

  let tab = $state<'slide' | 'layer'>('slide');
  const busy = $derived(designer.busy);
  let uploading = $state(false);
  let errorMessage = $state('');
  let status = $state('');
  let showVisibleArea = $state(true);
  /** Which layout the canvas shows and the panels edit. */
  let view = $state<'desktop' | 'mobile'>('desktop');
  let deleteKey = $state<string | null>(null);
  let deleting = $state(false);
  /** Navigation or form submit held back until the user decides about unsaved changes. */
  let leave = $state.raw<{ href: string } | { form: HTMLFormElement; submitter: HTMLElement | null } | null>(null);
  let discarding = false;
  let fileInput = $state<HTMLInputElement | null>(null);

  const active = $derived(designer.active);
  const activeKey = $derived(designer.activeKey);
  const layers = $derived(designer.layers);
  const selectedId = $derived(designer.selectedId);
  const selected = $derived(designer.selected);
  const selectedIndex = $derived(designer.selectedIndex);
  const mobileBoxes = $derived(resolveMobile(layers));
  const focus = $derived(slideFocus(active?.mobile));
  const canvasImage = $derived(active ? (active.previewUrl ?? active.imageUrl) : null);

  // Selecting a layer picks the matching panel.
  $effect(() => {
    tab = selectedId ? 'layer' : 'slide';
  });

  onMount(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (designer.anyDirty) event.preventDefault();
    };
    // ClientRouter navigation cannot be cancelled once the router sees it, so unsaved changes are
    // guarded earlier: capture-phase click/submit listeners hold the navigation and ask first.
    const guardClick = (event: MouseEvent) => {
      if (!designer.anyDirty || discarding || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      event.stopPropagation();
      leave = { href: url.href };
    };
    const guardSubmit = (event: SubmitEvent) => {
      const form = event.target as HTMLFormElement;
      if (!designer.anyDirty || discarding || form.closest('[data-designer-root]')) return;
      event.preventDefault();
      event.stopPropagation();
      leave = { form, submitter: event.submitter };
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', guardClick, true);
    document.addEventListener('submit', guardSubmit, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', guardClick, true);
      document.removeEventListener('submit', guardSubmit, true);
      session.dispose();
    };
  });

  // ---------------------------------------------------------------- layers

  function addLayer(layer: Layer) {
    const result = session.addLayer(layer);
    if (result.status === 'full') {
      toast.error(result.message);
      return;
    }
    if (result.status !== 'added') return;
    status = `${TYPE_LABEL[layer.type]} added.`;
    tick().then(() => document.querySelector<HTMLElement>(`[data-layer-id="${layer.id}"]`)?.focus());
  }

  function addType(type: LayerType) {
    if (type === 'image') fileInput?.click();
    else addLayer(defaultLayer(type));
  }

  async function uploadImageLayer(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    uploading = true;
    try {
      let uploaded: { url: string };
      try {
        uploaded = await postImage(file, 'layer');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'The image could not be uploaded.');
        return;
      }
      const ratio = await naturalRatio(uploaded.url);
      const layer = { ...defaultLayer('image'), src: uploaded.url, alt: '' } as Extract<Layer, { type: 'image' }>;
      // Snap the box to the file's natural aspect ratio (slide percentages are of a 16:9 box).
      const height = IMAGE_PRESETS[1].h;
      layer.h = height;
      layer.w = Math.round(height * ratio * (9 / 16) * 100) / 100;
      if (layer.w > 60) {
        layer.w = 60;
        layer.h = Math.round(((60 / ratio) * (16 / 9)) * 100) / 100;
      }
      addLayer(layer);
      await tick();
      document.getElementById('layer-alt')?.focus();
    } finally {
      uploading = false;
    }
  }

  function naturalRatio(url: string): Promise<number> {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth && image.naturalHeight ? image.naturalWidth / image.naturalHeight : 1);
      image.onerror = () => resolve(1);
      image.src = url;
    });
  }

  function removeSelected() {
    if (!session.removeSelected()) return;
    status = 'Layer deleted.';
    document.querySelector<HTMLElement>('[data-designer-area] [role="group"]')?.focus();
  }

  function duplicateSelected() {
    const result = session.duplicateSelected();
    if (result.status === 'full') toast.error(result.message);
    else if (result.status === 'added') status = 'Layer duplicated.';
  }

  const patchSelected = (patch: Partial<Layer>, coalesceKey?: string) => session.patchSelected(patch, coalesceKey);
  const patchMobile = (patch: MobileOverride, coalesceKey?: string) => session.patchMobile(patch, coalesceKey);
  const moveSelected = (move: ZMove) => session.moveSelected(move);

  function resetSelectedMobile() {
    if (session.resetSelectedMobile()) status = 'Phone layout of the layer reset to automatic.';
  }

  function resetSlideMobile() {
    if (session.resetSlideMobile()) status = 'Phone layout reset to automatic.';
  }

  /** Rendered box of the selected layer in percent of the slide, read from the canvas DOM. */
  function measureSelected(): Box | null {
    const el = document.querySelector<HTMLElement>(`[data-designer-area] [data-layer-id="${selectedId}"]`);
    return el ? measureLayerBox(el) : null;
  }

  function nudge(dx: number, dy: number) {
    if (view !== 'mobile') {
      session.nudge(dx, dy);
      return;
    }
    const box = measureSelected();
    if (box) session.nudge(dx, dy, box);
  }

  function onKeydown(event: KeyboardEvent) {
    if (deleteKey !== null) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 's') {
      event.preventDefault();
      save();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return; // native editing shortcuts
    if (mod && key === 'z') {
      event.preventDefault();
      if (event.shiftKey) session.redo();
      else session.undo();
      return;
    }
    if (mod && key === 'y') {
      event.preventDefault();
      session.redo();
      return;
    }
    if (mod && key === 'd' && selected) {
      event.preventDefault();
      duplicateSelected();
      return;
    }
    if (!(target === document.body || target.closest('[data-designer-area]')) || !selected) return;
    const step = event.shiftKey ? NUDGE_BIG : NUDGE;
    if (key === 'delete' || key === 'backspace') {
      event.preventDefault();
      removeSelected();
    } else if (key === 'escape') {
      session.select(null);
    } else if (key === 'arrowleft') {
      event.preventDefault();
      nudge(-step, 0);
    } else if (key === 'arrowright') {
      event.preventDefault();
      nudge(step, 0);
    } else if (key === 'arrowup') {
      event.preventDefault();
      nudge(0, -step);
    } else if (key === 'arrowdown') {
      event.preventDefault();
      nudge(0, step);
    }
  }

  // ---------------------------------------------------------------- slides

  function selectSlide(key: string) {
    session.selectSlide(key);
    errorMessage = '';
  }

  function addSlide() {
    if (session.addSlide()) errorMessage = '';
  }

  async function save() {
    errorMessage = '';
    const result = await session.save();
    if (result.status === 'invalid' || result.status === 'failed') errorMessage = result.message;
    else if (result.status === 'saved') {
      status = 'Slide saved.';
      toast.success('Slide saved.');
    }
  }

  function announceReorder(result: ReorderResult) {
    if (result.status === 'reverted') toast.error(result.message);
    else if (result.status === 'saved') {
      status = 'Slide order saved.';
      toast.success('Slide order saved.');
    }
  }

  const reorder = async (ids: number[]) => announceReorder(await session.reorder(ids));

  async function moveSlide(key: string, direction: -1 | 1) {
    const result = await session.moveSlide(key, direction);
    announceReorder(result);
    if (result.status === 'noop') return;
    await tick();
    document.querySelector<HTMLElement>(`[data-menu-trigger="${key}"]`)?.focus();
  }

  async function duplicateSlide(key: string) {
    const result = await session.duplicateSlide(key);
    if (result.status === 'failed') toast.error(result.message);
    else if (result.status === 'duplicated') {
      errorMessage = '';
      toast.success(result.savedVersion ? 'Slide duplicated (saved version).' : 'Slide duplicated.');
    }
  }

  async function placement(key: string, patch: { showOnMain?: boolean; departmentId?: number | null }) {
    const result = await session.placement(key, patch);
    if (result.status === 'failed') toast.error(result.message);
    else if (result.status === 'saved') status = 'Slide placement saved.';
  }

  async function confirmDelete() {
    if (deleteKey === null) return;
    const before = activeKey;
    deleting = true;
    const result = await session.deleteSlide(deleteKey);
    deleting = false;
    deleteKey = null;
    if (result.status === 'failed') toast.error(result.message || 'The slide could not be deleted.');
    else if (result.status === 'deleted') {
      if (designer.activeKey !== before) errorMessage = '';
      toast.success('Slide deleted.');
    }
  }

  function discardAndLeave() {
    const target = leave;
    leave = null;
    if (!target) return;
    discarding = true;
    if ('href' in target) navigate(target.href).finally(() => (discarding = false));
    else {
      target.form.requestSubmit(target.submitter);
      discarding = false;
    }
  }

  const addTools: { type: LayerType; label: string; icon: typeof Type }[] = [
    { type: 'text', label: 'Add text', icon: Type },
    { type: 'button', label: 'Add button', icon: MousePointerClick },
    { type: 'badge', label: 'Add badge', icon: Tag },
    { type: 'shape', label: 'Add panel', icon: Square },
    { type: 'image', label: 'Add logo', icon: ImagePlus },
  ];

  const tabClass = (current: boolean) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${current ? 'bg-surface text-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}`;
</script>

<svelte:window onkeydown={onKeydown} />

<div data-designer-root class="flex min-h-[calc(100dvh-4rem)] flex-col lg:h-[calc(100dvh-4rem)]">
  <div class="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[15rem_minmax(0,1fr)_21rem]">
    <!-- Slides -->
    <aside aria-label="Slides" class="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
      <h1 class="text-lg font-bold text-foreground">Slide designer</h1>
      {#if scopeName}
        <p class="text-xs text-muted-foreground" data-testid="scope-indicator">
          Showing: <span class="font-semibold text-foreground">{scopeName}</span> ·
          <button type="button" data-scope-change class="rounded-sm font-semibold text-link underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-ring">change</button>
        </p>
      {/if}
      <SlideStrip
        slides={designer.strip}
        activeKey={activeKey}
        {departments}
        {superadmin}
        {busy}
        onselect={selectSlide}
        onadd={addSlide}
        onreorder={reorder}
        onmove={moveSlide}
        onduplicate={duplicateSlide}
        ondelete={(key) => (deleteKey = key)}
        onplacement={placement}
      />
    </aside>

    <!-- Canvas -->
    <section aria-label="Canvas" class="flex min-h-0 min-w-0 flex-col gap-3 lg:overflow-y-auto">
      {#if active}
        <div role="toolbar" aria-label="Slide tools" class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-brand-sm">
          {#each addTools as tool (tool.type)}
            {@const Icon = tool.icon}
            <button type="button" class="{secondaryButtonClass} !px-3 !py-1.5 text-xs" onclick={() => addType(tool.type)} disabled={tool.type === 'image' && uploading}>
              {#if tool.type === 'image' && uploading}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{:else}<Icon class="h-4 w-4" aria-hidden="true" />{/if}
              {tool.label}
            </button>
          {/each}
          <input bind:this={fileInput} type="file" accept="image/*" class="sr-only" tabindex="-1" aria-label="Choose a logo or image to add" onchange={uploadImageLayer} />
          <span class="mx-1 hidden h-6 w-px bg-border-strong sm:block" aria-hidden="true"></span>
          <button type="button" class="{secondaryButtonClass} !p-2" onclick={() => session.undo()} disabled={!designer.canUndo} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
            <Undo2 class="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" class="{secondaryButtonClass} !p-2" onclick={() => session.redo()} disabled={!designer.canRedo} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 class="h-4 w-4" aria-hidden="true" />
          </button>
          <div role="group" aria-label="Layout" class="flex gap-1">
            <button
              type="button"
              class="{secondaryButtonClass} !px-3 !py-1.5 text-xs {view === 'desktop' ? '!border-brand-600 !bg-accent' : ''}"
              aria-pressed={view === 'desktop'}
              onclick={() => (view = 'desktop')}
            >
              <Monitor class="h-4 w-4" aria-hidden="true" /> Desktop
            </button>
            <button
              type="button"
              class="{secondaryButtonClass} !px-3 !py-1.5 text-xs {view === 'mobile' ? '!border-brand-600 !bg-accent' : ''}"
              aria-pressed={view === 'mobile'}
              onclick={() => (view = 'mobile')}
            >
              <Smartphone class="h-4 w-4" aria-hidden="true" /> Mobile
            </button>
          </div>
          {#if view === 'desktop'}
          <button
            type="button"
            class="{secondaryButtonClass} !px-3 !py-1.5 text-xs"
            aria-pressed={showVisibleArea}
            onclick={() => (showVisibleArea = !showVisibleArea)}
            title="Dim the part of the slide that wide screens crop"
          >
            {#if showVisibleArea}<Eye class="h-4 w-4" aria-hidden="true" />{:else}<EyeOff class="h-4 w-4" aria-hidden="true" />{/if}
            Wide-screen crop
          </button>
          {/if}
          <span class="ml-auto"></span>
          <button type="button" class="{primaryButtonClass} !px-4 !py-1.5 text-xs" onclick={save} disabled={designer.saving || (!designer.activeDirty && active.id !== null)} title="Save (Ctrl/Cmd+S)">
            {#if designer.saving}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{:else}<Save class="h-4 w-4" aria-hidden="true" />{/if}
            {active.id === null ? 'Create slide' : designer.activeDirty ? 'Save slide' : 'Saved'}
          </button>
        </div>

        {#if errorMessage}
          <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive" role="alert">{errorMessage}</p>
        {/if}

        <div data-designer-area>
          <SlideCanvas
            imageUrl={canvasImage}
            {layers}
            {selectedId}
            {showVisibleArea}
            {view}
            {focus}
            {mobileBoxes}
            onselect={(id) => session.select(id)}
            onlive={(next) => session.live(next)}
            oncommit={(base) => session.commitLive(base)}
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Drag layers to move, use the handles to resize. Arrow keys nudge (Shift for bigger steps), Delete removes, Ctrl/Cmd+D duplicates,
          Ctrl/Cmd+Z undoes, Ctrl/Cmd+S saves.
          {#if view === 'mobile'}
            You are editing the phone layout (4:5). Layers you have not moved are stacked automatically; moving one places it by hand, and
            “Reset to automatic” undoes that.
          {:else}
            On phones the slide is 4:5: layers you have not placed in the Mobile layout are stacked automatically.
          {/if}
        </p>
      {:else}
        <div class="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border-strong p-10 text-center text-muted-foreground">
          <div class="space-y-3">
            <p class="text-sm">Select a slide, or create one to start designing.</p>
            <button type="button" class={primaryButtonClass} onclick={addSlide}>Add slide</button>
          </div>
        </div>
      {/if}
      <p class="sr-only" role="status" aria-live="polite">{status}</p>
    </section>

    <!-- Properties -->
    <aside aria-label="Properties" class="flex min-h-0 flex-col gap-4 lg:overflow-y-auto">
      {#if active}
        <div class="flex gap-1 rounded-lg bg-surface-alt p-1" role="group" aria-label="Panel">
          <button type="button" class={tabClass(tab === 'slide')} aria-pressed={tab === 'slide'} onclick={() => (tab = 'slide')}>Slide</button>
          <button type="button" class={tabClass(tab === 'layer')} aria-pressed={tab === 'layer'} disabled={!selected} onclick={() => (tab = 'layer')}>
            Layer{selected ? `: ${TYPE_LABEL[selected.type]}` : ''}
          </button>
        </div>

        <div class="rounded-xl border border-border bg-surface p-4 shadow-brand-sm">
          {#if tab === 'layer' && selected}
            <LayerInspector
              layer={selected}
              index={selectedIndex}
              total={layers.length}
              onchange={patchSelected}
              onmove={moveSelected}
              onduplicate={duplicateSelected}
              ondelete={removeSelected}
              measure={measureSelected}
              {view}
              mobileBox={mobileBoxes.get(selected.id) ?? null}
              onmobile={patchMobile}
              onmobilereset={resetSelectedMobile}
            />
          {:else}
            {#key active.key}
            <SlideSettings
              bind:file={() => active?.file ?? null, (file) => session.setFile(file)}
              savedImageUrl={active.imageUrl}
              imageError={active.imageError}
              showOnMain={active.showOnMain}
              departmentId={active.departmentId}
              {departments}
              {superadmin}
              {busy}
              onplacement={(patch) => placement(active.key, patch)}
              video={active.video}
              onvideo={(value) => session.setVideo(value)}
              {focus}
              onfocus={(next) => session.setFocus(next)}
              mobileCustomized={active.mobile !== null || layers.some((layer) => layer.mobile !== undefined)}
              onmobilereset={resetSlideMobile}
            />
            {/key}
          {/if}
        </div>

        <section aria-label="Layers" data-designer-area class="rounded-xl border border-border bg-surface p-3 shadow-brand-sm">
          <h2 class="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
            <LayersIcon class="h-4 w-4" aria-hidden="true" /> Layers
            <span class="text-xs font-normal text-muted-foreground">({layers.length}/{MAX_LAYERS})</span>
          </h2>
          {#if layers.length === 0}
            <p class="text-xs text-muted-foreground">No layers yet. Use the tools above the canvas to add text, buttons, badges, panels or a logo.</p>
          {:else}
            <ul class="space-y-1">
              {#each layers.toReversed() as layer (layer.id)}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent {layer.id === selectedId ? 'bg-accent font-semibold text-accent-foreground ring-1 ring-brand-500' : 'text-foreground'}"
                    aria-pressed={layer.id === selectedId}
                    onclick={() => session.select(layer.id)}
                  >
                    <span class="w-14 shrink-0 text-xs text-muted-foreground">{TYPE_LABEL[layer.type].split(' ')[0]}</span>
                    <span class="truncate">{layerLabel(layer) || '(empty)'}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </aside>
  </div>
</div>

<ConfirmDialog
  bind:open={() => leave !== null, (value) => { if (!value) leave = null; }}
  title="Discard unsaved changes?"
  description="Some slides have changes that have not been saved. Leaving this page will lose them."
  confirmLabel="Discard"
  cancelLabel="Keep editing"
  destructive
  onConfirm={discardAndLeave}
/>

<ConfirmDialog
  bind:open={() => deleteKey !== null, (value) => { if (!value) deleteKey = null; }}
  title="Delete this slide?"
  description="The slide, its design and its image will be permanently removed."
  confirmLabel="Delete"
  destructive
  processing={deleting}
  onConfirm={confirmDelete}
/>
