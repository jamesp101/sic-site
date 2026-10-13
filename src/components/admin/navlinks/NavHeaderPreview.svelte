<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import { DEFAULT_NAV_LINKS, DEPARTMENTS_MENU_URL, type NavNode } from '@/lib/nav-tree';
  import { SITE } from '@/lib/site';

  interface Sub {
    key: string;
    /** Row selected when the item is clicked. */
    id: number | null;
    label: string;
    ghost: boolean;
  }
  interface Entry {
    key: string;
    id: number | null;
    label: string;
    ghost: boolean;
    auto: boolean;
    subs: Sub[] | null;
    /** The row (or one of its sub-links) is selected in the list. */
    selected: boolean;
  }

  let {
    tree,
    departments,
    showHidden = $bindable(false),
    selectedId,
    onselect,
  }: {
    tree: NavNode[];
    departments: { name: string; slug: string }[];
    showHidden?: boolean;
    selectedId: number | null;
    onselect: (id: number) => void;
  } = $props();

  let openKey = $state<string | null>(null);
  let root = $state<HTMLElement | null>(null);

  const departmentSubs = (id: number, ghost: boolean): Sub[] =>
    departments.map((d) => ({ key: `d${id}-${d.slug}`, id, label: d.name, ghost }));

  // Mirrors SiteHeader: hidden links are omitted, `#departments` and parents with sub-links become dropdowns
  // (their own URL is not used), an empty menu falls back to the default one.
  const entries = $derived.by(() => {
    const out: Entry[] = [];
    const anyVisible = tree.some((top) => top.isActive);
    if (!anyVisible) {
      for (const link of DEFAULT_NAV_LINKS) {
        const auto = link.url === DEPARTMENTS_MENU_URL;
        if (auto && departments.length === 0) continue;
        out.push({
          key: `default-${link.label}`,
          id: null,
          label: link.label,
          ghost: false,
          auto,
          subs: auto ? departmentSubs(0, false).map((s) => ({ ...s, id: null })) : null,
          selected: false,
        });
      }
    }
    for (const top of tree) {
      if (!top.isActive && !showHidden) continue;
      const ghost = !top.isActive;
      const auto = top.url.trim() === DEPARTMENTS_MENU_URL;
      const children = top.children.filter((child) => child.isActive || showHidden);
      const subs: Sub[] | null = auto
        ? departmentSubs(top.id, ghost)
        : children.length > 0
          ? children.map((child) => ({ key: `c${child.id}`, id: child.id, label: child.label, ghost: ghost || !child.isActive }))
          : null;
      out.push({
        key: `t${top.id}`,
        id: top.id,
        label: top.label,
        ghost,
        auto,
        subs,
        selected: selectedId !== null && (selectedId === top.id || top.children.some((child) => child.id === selectedId)),
      });
    }
    return out;
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || openKey === null) return;
    const trigger = root?.querySelector<HTMLElement>(`[data-trigger="${CSS.escape(openKey)}"]`);
    openKey = null;
    trigger?.focus();
  }

  function onWindowClick(event: MouseEvent) {
    if (root && event.target instanceof Node && !root.contains(event.target)) openKey = null;
  }

  const itemClass =
    'inline-flex items-center gap-1.5 rounded-lg border-b-2 px-3 py-1.5 text-sm font-medium transition-colors hover:text-gold-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300';
</script>

<svelte:window onkeydown={onKeydown} onclick={onWindowClick} />

<section
  bind:this={root}
  aria-labelledby="nav-preview-title"
  class="space-y-2 rounded-xl border border-border-strong bg-surface p-3 shadow-brand-sm md:sticky md:top-2 md:z-20"
>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 id="nav-preview-title" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live header preview</h2>
    <label class="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input type="checkbox" role="switch" bind:checked={showHidden} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
      Show hidden
    </label>
  </div>

  <div class="rounded-lg border border-white/10 bg-linear-to-r from-brand-800 to-brand-700 text-white shadow-brand-md">
    <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
      <div class="flex min-w-0 items-center gap-3">
        <img
          src="/sic-seal.png"
          alt=""
          width="44"
          height="44"
          decoding="async"
          class="h-11 w-11 shrink-0 rounded-full border-2 border-gold-500/40 bg-white/5 object-contain"
        />
        <span class="min-w-0 leading-tight">
          <span class="block truncate font-serif text-lg font-bold tracking-tight">{SITE.name}</span>
          <span class="block text-xs uppercase tracking-[0.2em] text-gold-300">{SITE.motto}</span>
        </span>
      </div>

      <ul class="flex flex-wrap items-center gap-x-1 gap-y-1" data-testid="nav-preview" aria-label="Header links">
        {#each entries as entry (entry.key)}
          <li class="group relative">
            {#if entry.subs}
              <button
                type="button"
                data-trigger={entry.key}
                class="{itemClass} {entry.ghost ? 'border-dashed border-white/40 text-white/70' : 'text-white/90'} {entry.selected
                  ? 'border-gold-500'
                  : entry.ghost
                    ? ''
                    : 'border-transparent'}"
                aria-expanded={openKey === entry.key}
                aria-controls={`preview-menu-${entry.key}`}
                onclick={() => {
                  openKey = openKey === entry.key ? null : entry.key;
                  if (entry.id !== null) onselect(entry.id);
                }}
              >
                {entry.label}
                {#if entry.ghost}<span class="rounded bg-white/15 px-1.5 text-xs font-semibold text-white">Hidden</span>{/if}
                <ChevronDown class="h-4 w-4 transition-transform {openKey === entry.key ? 'rotate-180' : ''}" aria-hidden="true" />
              </button>
              <ul
                id={`preview-menu-${entry.key}`}
                class="absolute left-0 top-full z-30 mt-1 w-64 max-w-[80vw] flex-col gap-0.5 rounded-xl border border-white/10 bg-brand-800 p-2 shadow-brand-lg group-focus-within:flex group-hover:flex {openKey ===
                entry.key
                  ? 'flex'
                  : 'hidden'}"
              >
                {#if entry.subs.length === 0}
                  <li class="px-3 py-2 text-xs text-white/70">No departments yet.</li>
                {/if}
                {#each entry.subs as sub (sub.key)}
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gold-300 {sub.ghost
                        ? 'text-white/70'
                        : 'text-white/90'} {sub.id !== null && sub.id === selectedId ? 'bg-white/15' : ''}"
                      onclick={() => {
                        openKey = null;
                        if (sub.id !== null) onselect(sub.id);
                      }}
                    >
                      <span class="truncate">{sub.label}</span>
                      {#if sub.ghost}<span class="shrink-0 rounded bg-white/15 px-1.5 text-xs font-semibold text-white">Hidden</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
            {:else}
              <button
                type="button"
                class="{itemClass} {entry.ghost ? 'border-dashed border-white/40 text-white/70' : 'text-white/90'} {entry.selected
                  ? 'border-gold-500'
                  : entry.ghost
                    ? ''
                    : 'border-transparent'}"
                onclick={() => entry.id !== null && onselect(entry.id)}
              >
                {entry.label}
                {#if entry.ghost}<span class="rounded bg-white/15 px-1.5 text-xs font-semibold text-white">Hidden</span>{/if}
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  </div>

  <p class="text-xs text-muted-foreground">
    {#if !tree.some((top) => top.isActive)}
      No visible links, so the site shows its default menu.
    {:else}
      Open a dropdown by hovering, focusing or clicking it. Click an item to jump to its row.
    {/if}
    Parent links open a dropdown and their own URL is not used.
  </p>
</section>
