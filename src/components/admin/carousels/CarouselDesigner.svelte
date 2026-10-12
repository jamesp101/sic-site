<script lang="ts">
  import { actions } from 'astro:actions';
  import {
    Eye,
    EyeOff,
    ImagePlus,
    Layers as LayersIcon,
    Loader2,
    MousePointerClick,
    Redo2,
    Save,
    Square,
    Tag,
    Type,
    Undo2,
  } from '@lucide/svelte';
  import { navigate } from 'astro:transitions/client';
  import { onMount, tick, untrack } from 'svelte';
  import { toast } from 'svelte-sonner';
  import {
    NUDGE,
    NUDGE_BIG,
    commit,
    createHistory,
    duplicateLayer,
    moveLayer,
    patchLayer,
    redo,
    undo,
    type History,
    type ZMove,
  } from '@/lib/carousel-editor';
  import {
    MAX_LAYERS,
    TYPE_LABEL,
    defaultLayer,
    layerLabel,
    legacyLayers,
    newLayerId,
    serializeOverlay,
    type Layer,
    type LayerType,
  } from '@/lib/carousel-overlay';
  import { parseOverlayStrict } from '@/lib/carousel-overlay-schema';
  import type { DesignerSlide } from '@/lib/server/carousel-admin';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { append, inputClass, parseActionError, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';
  import LayerInspector from './LayerInspector.svelte';
  import SlideCanvas from './SlideCanvas.svelte';
  import SlideSettings from './SlideSettings.svelte';
  import SlideStrip from './SlideStrip.svelte';
  import type { StripSlide } from './types';

  interface Draft {
    /** String(id) for saved slides, "new" for the one unsaved slide. */
    key: string;
    id: number | null;
    imageUrl: string | null;
    /** Replacement image chosen in the cropper, not uploaded yet. */
    file: File | null;
    previewUrl: string | null;
    departmentId: number | null;
    showOnMain: boolean;
    title: string;
    history: History<Layer[]>;
    /** Serialized layers as last saved; LEGACY marks a slide converted from title/subtitle/link. */
    baseline: string;
    imageError: string;
  }

  const LEGACY = '__legacy__';

  let {
    slides,
    departments,
    initialId,
    superadmin,
    lockedDepartmentId,
  }: {
    slides: DesignerSlide[];
    departments: { id: number; name: string }[];
    initialId: number | null;
    superadmin: boolean;
    lockedDepartmentId: number | null;
  } = $props();

  function fromSlide(slide: DesignerSlide): Draft {
    const legacy = slide.overlay === null;
    const layers = slide.overlay ?? legacyLayers(slide);
    return {
      key: String(slide.id),
      id: slide.id,
      imageUrl: slide.imageUrl,
      file: null,
      previewUrl: null,
      departmentId: slide.departmentId,
      showOnMain: slide.showOnMain,
      title: slide.title ?? '',
      history: createHistory(layers),
      baseline: legacy && layers.length > 0 ? LEGACY : serializeOverlay(layers),
      imageError: '',
    };
  }

  let drafts = $state.raw<Draft[]>(untrack(() => slides.map(fromSlide)));
  let activeKey = $state<string | null>(untrack(() => (initialId !== null ? String(initialId) : (drafts[0]?.key ?? null))));
  let selectedId = $state<string | null>(null);
  let tab = $state<'slide' | 'layer'>('slide');
  let saving = $state(false);
  let busy = $state(false);
  let uploading = $state(false);
  let errorMessage = $state('');
  let status = $state('');
  let departmentFilter = $state('');
  let showVisibleArea = $state(true);
  let deleteKey = $state<string | null>(null);
  let deleting = $state(false);
  /** Navigation or form submit held back until the user decides about unsaved changes. */
  let leave = $state.raw<{ href: string } | { form: HTMLFormElement; submitter: HTMLElement | null } | null>(null);
  let discarding = false;
  let fileInput = $state<HTMLInputElement | null>(null);

  const visible = $derived(
    drafts.filter((draft) => {
      if (!superadmin || draft.id === null || departmentFilter === '') return true;
      if (departmentFilter === 'main') return draft.departmentId === null;
      return String(draft.departmentId) === departmentFilter;
    }),
  );
  const active = $derived(drafts.find((draft) => draft.key === activeKey) ?? null);
  const layers = $derived(active?.history.present ?? []);
  const selectedIndex = $derived(layers.findIndex((layer) => layer.id === selectedId));
  const selected = $derived(selectedIndex >= 0 ? layers[selectedIndex] : null);
  const canvasImage = $derived(active ? (active.previewUrl ?? active.imageUrl) : null);

  const isDirty = (draft: Draft) => draft.id === null || draft.file !== null || draft.baseline !== serializeOverlay(draft.history.present);
  const activeDirty = $derived(active ? isDirty(active) : false);
  const anyDirty = $derived(drafts.some((draft) => draft.id !== null && isDirty(draft)) || drafts.some((draft) => draft.id === null && (draft.file || draft.history.present.length > 0)));
  const legacyPending = $derived(active?.baseline === LEGACY);

  const strip = $derived<StripSlide[]>(
    visible.map((draft) => ({
      key: draft.key,
      id: draft.id,
      imageUrl: draft.previewUrl ?? draft.imageUrl,
      layers: draft.history.present,
      dirty: isDirty(draft),
      departmentId: draft.departmentId,
      showOnMain: draft.showOnMain,
      title: draft.title,
    })),
  );

  // Keep the open slide inside the filtered strip; selecting a slide or layer picks the matching panel.
  $effect(() => {
    if (activeKey !== null && !visible.some((draft) => draft.key === activeKey)) activeKey = visible[0]?.key ?? null;
  });
  $effect(() => {
    tab = selectedId ? 'layer' : 'slide';
  });

  onMount(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (anyDirty) event.preventDefault();
    };
    // ClientRouter navigation cannot be cancelled once the router sees it, so unsaved changes are
    // guarded earlier: capture-phase click/submit listeners hold the navigation and ask first.
    const guardClick = (event: MouseEvent) => {
      if (!anyDirty || discarding || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
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
      if (!anyDirty || discarding || form.closest('[data-designer-root]')) return;
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
      for (const draft of drafts) if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    };
  });

  function update(key: string | null, change: (draft: Draft) => Draft) {
    drafts = drafts.map((draft) => (draft.key === key ? change(draft) : draft));
  }

  // ---------------------------------------------------------------- layers

  function applyLayers(next: Layer[], coalesceKey?: string) {
    update(activeKey, (draft) => ({ ...draft, history: commit(draft.history, next, coalesceKey ?? null) }));
  }

  const LIMITS: Record<string, [number, number]> = { x: [0, 100], y: [0, 100], w: [1, 100], h: [1, 100], rotation: [-180, 180] };

  function patchSelected(patch: Partial<Layer>, coalesceKey?: string) {
    if (!selected) return;
    const safe: Record<string, unknown> = { ...patch };
    for (const [field, [min, max]] of Object.entries(LIMITS)) {
      if (typeof safe[field] === 'number') safe[field] = Math.min(max, Math.max(min, safe[field] as number));
    }
    applyLayers(patchLayer(layers, selected.id, safe as Partial<Layer>), coalesceKey ? `${selected.id}:${coalesceKey}` : undefined);
  }

  function addLayer(layer: Layer) {
    if (!active) return;
    if (layers.length >= MAX_LAYERS) {
      toast.error(`A slide can have at most ${MAX_LAYERS} layers.`);
      return;
    }
    applyLayers([...layers, layer]);
    selectedId = layer.id;
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
      const body = new FormData();
      body.append('image', file);
      const { data: result, error } = await actions.carousels.uploadImage(body);
      if (error || !result) {
        toast.error(parseActionError(error).message || 'The image could not be uploaded.');
        return;
      }
      const ratio = await naturalRatio(result.url);
      const width = 14;
      const layer = { ...defaultLayer('image'), src: result.url, alt: '' } as Extract<Layer, { type: 'image' }>;
      layer.w = width;
      // Slide percentages are of a 16:9 box, so the height share depends on the image ratio.
      layer.h = Math.min(80, Math.max(2, (width / ratio) * (16 / 9)));
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
    if (!selected) return;
    applyLayers(layers.filter((layer) => layer.id !== selected.id));
    selectedId = null;
    status = 'Layer deleted.';
    document.querySelector<HTMLElement>('[data-designer-area] [role="group"]')?.focus();
  }

  function duplicateSelected() {
    if (!selected) return;
    if (layers.length >= MAX_LAYERS) {
      toast.error(`A slide can have at most ${MAX_LAYERS} layers.`);
      return;
    }
    const copy = duplicateLayer(selected, newLayerId());
    const next = layers.slice();
    next.splice(selectedIndex + 1, 0, copy);
    applyLayers(next);
    selectedId = copy.id;
    status = 'Layer duplicated.';
  }

  function moveSelected(move: ZMove) {
    if (selected) applyLayers(moveLayer(layers, selected.id, move));
  }

  function history(change: (current: History<Layer[]>) => History<Layer[]>) {
    if (!active) return;
    const next = change(active.history);
    update(active.key, (draft) => ({ ...draft, history: next }));
    if (selectedId && !next.present.some((layer) => layer.id === selectedId)) selectedId = null;
  }
  const doUndo = () => history(undo);
  const doRedo = () => history(redo);

  function nudge(dx: number, dy: number) {
    if (!selected) return;
    const maxX = 'w' in selected ? 100 - selected.w : 100;
    const maxY = 'h' in selected ? 100 - selected.h : 100;
    patchSelected(
      { x: Math.min(maxX, Math.max(0, selected.x + dx)), y: Math.min(maxY, Math.max(0, selected.y + dy)) },
      'nudge',
    );
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
      if (event.shiftKey) doRedo();
      else doUndo();
      return;
    }
    if (mod && key === 'y') {
      event.preventDefault();
      doRedo();
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
      selectedId = null;
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
    activeKey = key;
    selectedId = null;
    errorMessage = '';
  }

  function addSlide() {
    if (drafts.some((draft) => draft.id === null)) return;
    const filterDepartment = departmentFilter && departmentFilter !== 'main' ? Number(departmentFilter) : null;
    drafts = [
      ...drafts,
      {
        key: 'new',
        id: null,
        imageUrl: null,
        file: null,
        previewUrl: null,
        departmentId: lockedDepartmentId ?? filterDepartment,
        showOnMain: true,
        title: '',
        history: createHistory<Layer[]>([]),
        baseline: serializeOverlay([]),
        imageError: '',
      },
    ];
    selectSlide('new');
  }

  function setFile(file: File | null) {
    update(activeKey, (draft) => {
      if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
      return { ...draft, file, previewUrl: file ? URL.createObjectURL(file) : null, imageError: '' };
    });
  }

  async function save() {
    const draft = active;
    if (!draft || saving || (!activeDirty && draft.id !== null)) return;
    errorMessage = '';
    update(draft.key, (current) => ({ ...current, imageError: '' }));
    if (draft.id === null && !draft.file) {
      update(draft.key, (current) => ({ ...current, imageError: 'Choose a slide image.' }));
      errorMessage = 'Choose a slide image before saving.';
      selectedId = null;
      return;
    }
    const json = serializeOverlay(draft.history.present);
    const check = parseOverlayStrict(json);
    if (!check.ok) {
      errorMessage = check.error;
      return;
    }

    saving = true;
    const form = new FormData();
    append(form, 'overlay', json);
    append(form, 'image', draft.file);
    let result;
    if (draft.id === null) {
      append(form, 'departmentId', draft.departmentId);
      append(form, 'showOnMain', draft.showOnMain);
      result = await actions.carousels.create(form);
    } else {
      append(form, 'id', draft.id);
      result = await actions.carousels.update(form);
    }
    saving = false;

    if (result.error) {
      const parsed = parseActionError(result.error);
      if (parsed.fields.image) update(draft.key, (current) => ({ ...current, imageError: parsed.fields.image }));
      errorMessage = parsed.fields.overlay || parsed.fields.image || parsed.message || 'The slide could not be saved.';
      return;
    }

    const slide = result.data.slide;
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    update(draft.key, (current) => ({
      ...current,
      key: String(slide.id),
      id: slide.id,
      imageUrl: slide.imageUrl,
      file: null,
      previewUrl: null,
      departmentId: slide.departmentId,
      showOnMain: slide.showOnMain,
      title: slide.title ?? '',
      baseline: json,
      imageError: '',
    }));
    if (activeKey === draft.key) activeKey = String(slide.id);
    status = 'Slide saved.';
    toast.success('Slide saved.');
  }

  async function reorder(ids: number[]) {
    const previous = drafts;
    const positions = drafts.flatMap((draft, index) => (draft.id !== null && ids.includes(draft.id) ? [index] : []));
    const byId = new Map(drafts.map((draft) => [draft.id, draft]));
    const next = [...drafts];
    positions.forEach((position, index) => (next[position] = byId.get(ids[index]) as Draft));
    drafts = next;

    const { error } = await actions.carousels.reorder({ ids });
    if (error) {
      drafts = previous;
      toast.error(parseActionError(error).message);
      return;
    }
    status = 'Slide order saved.';
    toast.success('Slide order saved.');
  }

  function moveSlide(key: string, direction: -1 | 1) {
    const ids = visible.flatMap((draft) => (draft.id === null ? [] : [draft.id]));
    const from = ids.indexOf(Number(key));
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder(ids).then(() => tick()).then(() => document.querySelector<HTMLElement>(`[data-menu-trigger="${key}"]`)?.focus());
  }

  async function duplicateSlide(key: string) {
    const draft = drafts.find((item) => item.key === key);
    if (!draft || draft.id === null || busy) return;
    busy = true;
    const { data, error } = await actions.carousels.duplicate({ id: draft.id });
    busy = false;
    if (error) {
      toast.error(parseActionError(error).message);
      return;
    }
    const copy = fromSlide(data.slide);
    const index = drafts.findIndex((item) => item.key === key);
    drafts = [...drafts.slice(0, index + 1), copy, ...drafts.slice(index + 1)];
    selectSlide(copy.key);
    toast.success(isDirty(draft) ? 'Slide duplicated (saved version).' : 'Slide duplicated.');
  }

  async function placement(key: string, patch: { showOnMain?: boolean; departmentId?: number | null }) {
    const draft = drafts.find((item) => item.key === key);
    if (!draft) return;
    if (draft.id === null) {
      update(key, (current) => ({ ...current, ...patch }));
      return;
    }
    busy = true;
    const { data, error } = await actions.carousels.placement({ id: draft.id, ...patch });
    busy = false;
    if (error) {
      toast.error(parseActionError(error).message);
      return;
    }
    update(key, (current) => ({ ...current, departmentId: data.slide.departmentId, showOnMain: data.slide.showOnMain }));
    status = 'Slide placement saved.';
  }

  async function confirmDelete() {
    const draft = drafts.find((item) => item.key === deleteKey);
    if (!draft) {
      deleteKey = null;
      return;
    }
    deleting = true;
    if (draft.id !== null) {
      const { error } = await actions.carousels.delete({ id: draft.id });
      if (error) {
        deleting = false;
        deleteKey = null;
        toast.error(parseActionError(error).message || 'The slide could not be deleted.');
        return;
      }
    }
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    const index = visible.findIndex((item) => item.key === draft.key);
    drafts = drafts.filter((item) => item.key !== draft.key);
    if (activeKey === draft.key) {
      const rest = visible.filter((item) => item.key !== draft.key);
      const neighbour = rest[Math.min(index, rest.length - 1)];
      if (neighbour) selectSlide(neighbour.key);
      else activeKey = null;
    }
    deleting = false;
    deleteKey = null;
    toast.success('Slide deleted.');
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
      {#if superadmin}
        <div>
          <label for="slide-filter" class="mb-1 block text-xs font-semibold text-muted-foreground">Show slides for</label>
          <select id="slide-filter" bind:value={departmentFilter} class={inputClass}>
            <option value="">All slides</option>
            <option value="main">Main page only</option>
            {#each departments as department (department.id)}
              <option value={String(department.id)}>{department.name}</option>
            {/each}
          </select>
        </div>
      {/if}
      <SlideStrip
        slides={strip}
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
          <button type="button" class="{secondaryButtonClass} !px-2 !py-1.5" onclick={doUndo} disabled={!active.history.past.length} aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">
            <Undo2 class="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" class="{secondaryButtonClass} !px-2 !py-1.5" onclick={doRedo} disabled={!active.history.future.length} aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">
            <Redo2 class="h-4 w-4" aria-hidden="true" />
          </button>
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
          <span class="ml-auto"></span>
          <button type="button" class="{primaryButtonClass} !px-4 !py-1.5 text-xs" onclick={save} disabled={saving || (!activeDirty && active.id !== null)} title="Save (Ctrl/Cmd+S)">
            {#if saving}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{:else}<Save class="h-4 w-4" aria-hidden="true" />{/if}
            {active.id === null ? 'Create slide' : activeDirty ? 'Save slide' : 'Saved'}
          </button>
        </div>

        {#if legacyPending}
          <p class="rounded-lg border border-border-strong bg-surface-alt px-3 py-2 text-xs text-muted-foreground" role="note">
            This slide used the old title / subtitle / link fields. They were converted into layers you can move and style. Save to publish the new design.
          </p>
        {/if}
        {#if errorMessage}
          <p class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive" role="alert">{errorMessage}</p>
        {/if}

        <div data-designer-area>
          <SlideCanvas
            imageUrl={canvasImage}
            {layers}
            {selectedId}
            {showVisibleArea}
            onselect={(id) => (selectedId = id)}
            onlive={(next) => update(activeKey, (draft) => ({ ...draft, history: { ...draft.history, present: next } }))}
            oncommit={(base) =>
              update(activeKey, (draft) => ({ ...draft, history: commit({ ...draft.history, present: base }, draft.history.present) }))}
          />
        </div>
        <p class="text-xs text-muted-foreground">
          Drag layers to move, use the handles to resize. Arrow keys nudge (Shift for bigger steps), Delete removes, Ctrl/Cmd+D duplicates,
          Ctrl/Cmd+Z undoes, Ctrl/Cmd+S saves. On phones the layers stack in reading order below the photo’s focal area.
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
            />
          {:else}
            <SlideSettings
              bind:file={() => active?.file ?? null, setFile}
              savedImageUrl={active.imageUrl}
              imageError={active.imageError}
              showOnMain={active.showOnMain}
              departmentId={active.departmentId}
              {departments}
              {superadmin}
              {busy}
              onplacement={(patch) => placement(active.key, patch)}
            />
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
                    onclick={() => (selectedId = layer.id)}
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
