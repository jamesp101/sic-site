<script lang="ts">
  import { ChevronDown, ChevronUp, Copy, Ellipsis, Eye, EyeOff, GripVertical, Plus, Trash2 } from '@lucide/svelte';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { onMount } from 'svelte';
  import { flip } from 'svelte/animate';
  import { inputClass, primaryButtonClass } from '../shared/form-utils';
  import SlideStage from './SlideStage.svelte';
  import type { StripSlide } from './types';

  let {
    slides,
    activeKey,
    departments,
    superadmin,
    busy = false,
    onselect,
    onadd,
    onreorder,
    onmove,
    onduplicate,
    ondelete,
    onplacement,
  }: {
    slides: StripSlide[];
    activeKey: string | null;
    departments: { id: number; name: string }[];
    superadmin: boolean;
    busy?: boolean;
    onselect: (key: string) => void;
    onadd: () => void;
    /** New order of the saved slides shown in the strip (ids). */
    onreorder: (ids: number[]) => void;
    onmove: (key: string, direction: -1 | 1) => void;
    onduplicate: (key: string) => void;
    ondelete: (key: string) => void;
    onplacement: (key: string, patch: { showOnMain?: boolean; departmentId?: number | null }) => void;
  } = $props();

  // Items carry `key` because svelte-dnd-action swaps the dragged item's id for a placeholder id.
  interface ZoneItem {
    id: number;
    key: string;
  }

  let reducedMotion = $state(false);
  let openMenu = $state<string | null>(null);
  let zone = $state.raw<ZoneItem[]>([]);
  let dragging = false;

  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = media.matches;
    const change = () => (reducedMotion = media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  });

  const saved = $derived(slides.filter((slide) => slide.id !== null));
  const draft = $derived(slides.find((slide) => slide.id === null) ?? null);
  const byKey = $derived(Object.fromEntries(saved.map((slide) => [slide.key, slide])));
  const duration = $derived(reducedMotion ? 0 : 160);

  $effect(() => {
    const next = saved.map((slide) => ({ id: slide.id as number, key: slide.key }));
    if (!dragging) zone = next;
  });

  function consider(event: CustomEvent<DndEvent<ZoneItem>>) {
    dragging = true;
    zone = event.detail.items;
  }
  function finalize(event: CustomEvent<DndEvent<ZoneItem>>) {
    dragging = false;
    zone = event.detail.items;
    const ids = zone.map((item) => item.id);
    if (ids.join() !== saved.map((slide) => slide.id).join()) onreorder(ids);
  }

  function closeMenu(event: Event) {
    if (openMenu && !(event.target as HTMLElement).closest('[data-slide-menu]')) openMenu = null;
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openMenu) {
      const key = openMenu;
      openMenu = null;
      document.querySelector<HTMLElement>(`[data-menu-trigger="${key}"]`)?.focus();
    }
  }

  const menuItem =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50';
</script>

<svelte:window onpointerdown={closeMenu} onkeydown={onKeydown} />

{#snippet tile(slide: StripSlide, position: number, count: number, draggable: boolean)}
  {@const active = slide.key === activeKey}
  <div
    class="group relative rounded-xl border bg-surface p-2 shadow-brand-sm transition-colors {active
      ? 'border-brand-500 ring-2 ring-ring/40'
      : 'border-border hover:border-border-strong'}"
  >
    <div class="flex items-center gap-1">
      {#if draggable}
        <span
          class="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing"
          title="Drag to reorder"
          aria-hidden="true"
        >
          <GripVertical class="h-4 w-4" aria-hidden="true" />
        </span>
      {:else}
        <span class="w-6 shrink-0"></span>
      {/if}
      <button
        type="button"
        class="min-w-0 flex-1 rounded-md text-left"
        data-slide-id={slide.id ?? undefined}
        aria-label="Edit slide {position} of {count}{slide.title ? `: ${slide.title}` : ''}{slide.dirty ? ' (unsaved changes)' : ''}"
        aria-current={active ? 'true' : undefined}
        onclick={() => onselect(slide.key)}
      >
        <span class="pointer-events-none block overflow-hidden rounded-md border border-border-strong">
          <SlideStage imageUrl={slide.imageUrl} layers={slide.layers} />
        </span>
      </button>
      <div class="relative shrink-0" data-slide-menu>
        <button
          type="button"
          data-menu-trigger={slide.key}
          class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Actions for slide {position}"
          aria-haspopup="true"
          aria-expanded={openMenu === slide.key}
          onclick={() => (openMenu = openMenu === slide.key ? null : slide.key)}
        >
          <Ellipsis class="h-4 w-4" aria-hidden="true" />
        </button>
        {#if openMenu === slide.key}
          <div class="absolute right-0 top-9 z-30 w-56 space-y-0.5 rounded-lg border border-border-strong bg-popover p-1.5 shadow-brand-lg" role="group" aria-label="Slide {position} actions">
            <button type="button" class={menuItem} disabled={slide.id === null || busy} onclick={() => { openMenu = null; onduplicate(slide.key); }}>
              <Copy class="h-4 w-4" aria-hidden="true" /> Duplicate
            </button>
            {#if slide.id !== null}
              <button type="button" class={menuItem} disabled={position === 1 || busy} onclick={() => onmove(slide.key, -1)}>
                <ChevronUp class="h-4 w-4" aria-hidden="true" /> Move earlier
              </button>
              <button type="button" class={menuItem} disabled={position === count || busy} onclick={() => onmove(slide.key, 1)}>
                <ChevronDown class="h-4 w-4" aria-hidden="true" /> Move later
              </button>
            {/if}
            <button type="button" class={menuItem} aria-pressed={slide.showOnMain} disabled={busy} onclick={() => onplacement(slide.key, { showOnMain: !slide.showOnMain })}>
              {#if slide.showOnMain}<Eye class="h-4 w-4" aria-hidden="true" />{:else}<EyeOff class="h-4 w-4" aria-hidden="true" />{/if}
              {slide.showOnMain ? 'Shown on main page' : 'Hidden from main page'}
            </button>
            {#if superadmin}
              <div class="px-2 py-1">
                <label for="menu-dept-{slide.key}" class="mb-1 block text-xs font-semibold text-muted-foreground">Department page</label>
                <select
                  id="menu-dept-{slide.key}"
                  class="{inputClass} !py-1.5"
                  value={slide.departmentId === null ? '' : String(slide.departmentId)}
                  disabled={busy}
                  onchange={(event) => onplacement(slide.key, { departmentId: event.currentTarget.value ? Number(event.currentTarget.value) : null })}
                >
                  <option value="">None (main page only)</option>
                  {#each departments as department (department.id)}
                    <option value={String(department.id)}>{department.name}</option>
                  {/each}
                </select>
              </div>
            {/if}
            <button type="button" class="{menuItem} !text-destructive" onclick={() => { openMenu = null; ondelete(slide.key); }}>
              <Trash2 class="h-4 w-4" aria-hidden="true" /> Delete slide
            </button>
          </div>
        {/if}
      </div>
    </div>
    <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7 text-xs font-semibold">
      <span class="text-muted-foreground">{position}</span>
      {#if slide.dirty}<span class="rounded-full bg-status-event-bg px-2 py-0.5 text-status-event-fg">{slide.id === null ? 'New' : 'Unsaved'}</span>{/if}
      {#if slide.departmentId !== null}
        <span class="rounded-full bg-status-announcement-bg px-2 py-0.5 text-status-announcement-fg">
          {departments.find((department) => department.id === slide.departmentId)?.name ?? 'Department'}
        </span>
      {/if}
      {#if slide.showOnMain}
        <span class="rounded-full bg-status-article-bg px-2 py-0.5 text-status-article-fg">Main page</span>
      {:else if slide.departmentId === null}
        <span class="rounded-full bg-file-other-bg px-2 py-0.5 text-file-other-fg">Hidden</span>
      {/if}
    </div>
  </div>
{/snippet}

<div class="flex min-h-0 flex-1 flex-col gap-3">
  <button type="button" class={primaryButtonClass} onclick={onadd} disabled={draft !== null}>
    <Plus class="h-4 w-4" aria-hidden="true" /> Add slide
  </button>

  <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
    <ul
      aria-label="Slides"
      class="space-y-3"
      use:dndzone={{ items: zone, flipDurationMs: duration, type: 'carousel-slides', dropTargetStyle: {} }}
      onconsider={consider}
      onfinalize={finalize}
    >
      {#each zone as item, index (item.id)}
        <li animate:flip={{ duration }} aria-label="Slide {index + 1}. Press Space to pick up for reordering, arrow keys to move, Space to drop.">
          {#if byKey[item.key]}{@render tile(byKey[item.key], index + 1, saved.length, true)}{/if}
        </li>
      {/each}
    </ul>
    {#if draft}
      <div>{@render tile(draft, saved.length + 1, saved.length + 1, false)}</div>
    {/if}
    {#if slides.length === 0}
      <p class="rounded-lg border border-dashed border-border-strong p-4 text-center text-sm text-muted-foreground">
        No slides yet. Add one to start designing.
      </p>
    {/if}
  </div>
</div>
