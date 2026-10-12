<script lang="ts">
  import { onMount } from 'svelte';
  import type { DepartmentRef } from '@/lib/content-types';

  let {
    action,
    search = '',
    searchLabel = 'Search',
    searchPlaceholder = 'Search…',
    departmentId = null,
    departments,
    sort,
    hidden = {},
    active = false,
    clearHref,
  }: {
    /** Page path the GET form submits to. */
    action: string;
    search?: string;
    searchLabel?: string;
    searchPlaceholder?: string;
    departmentId?: number | null;
    departments: DepartmentRef[];
    /** Provide to show the sort control. */
    sort?: 'newest' | 'oldest';
    /** Extra query params preserved on submit (e.g. type, directory). */
    hidden?: Record<string, string>;
    /** Any filter is active: shows the clear link. */
    active?: boolean;
    clearHref: string;
  } = $props();

  const DEBOUNCE_MS = 300;
  const FOCUS_KEY = 'filterbar-focus';

  let form: HTMLFormElement | undefined = $state();
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    // A navigation reloads the page; put the caret back where the visitor was typing.
    if (sessionStorage.getItem(FOCUS_KEY) === 'search') {
      sessionStorage.removeItem(FOCUS_KEY);
      const input = form?.querySelector<HTMLInputElement>('input[name="search"]');
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
    return () => clearTimeout(timer);
  });

  function navigate(focusSearch: boolean) {
    if (!form) return;
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value !== 'string' || value.trim() === '') continue;
      if (key === 'sort' && value === 'newest') continue;
      params.set(key, value.trim());
    }
    if (focusSearch) sessionStorage.setItem(FOCUS_KEY, 'search');
    const query = params.toString();
    location.assign(query ? `${action}?${query}` : action);
  }

  function onSearchInput() {
    clearTimeout(timer);
    timer = setTimeout(() => navigate(true), DEBOUNCE_MS);
  }

  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';
  const control =
    'block w-full rounded-xl border border-border-strong bg-surface px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground';
</script>

<form
  bind:this={form}
  method="get"
  {action}
  role="search"
  aria-label={searchLabel}
  class="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 shadow-brand-sm md:flex-row md:items-end"
>
  {#each Object.entries(hidden) as [name, value] (name)}
    <input type="hidden" {name} {value} />
  {/each}

  <div class="flex-1">
    <label for="filter-search" class={label}>{searchLabel}</label>
    <input
      id="filter-search"
      type="search"
      name="search"
      value={search}
      placeholder={searchPlaceholder}
      autocomplete="off"
      oninput={onSearchInput}
      class={control}
    />
  </div>

  <div class="md:w-64">
    <label for="filter-department" class={label}>Department</label>
    <select id="filter-department" name="department_id" onchange={() => navigate(false)} class={control}>
      <option value="">All departments</option>
      {#each departments as department (department.id)}
        <option value={department.id} selected={department.id === departmentId}>{department.name}</option>
      {/each}
    </select>
  </div>

  {#if sort}
    <div class="md:w-44">
      <label for="filter-sort" class={label}>Sort by</label>
      <select id="filter-sort" name="sort" onchange={() => navigate(false)} class={control}>
        <option value="newest" selected={sort === 'newest'}>Newest first</option>
        <option value="oldest" selected={sort === 'oldest'}>Oldest first</option>
      </select>
    </div>
  {/if}

  <div class="flex items-center gap-3">
    <button
      type="submit"
      class="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
    >
      Apply
    </button>
    {#if active}
      <a href={clearHref} class="rounded text-sm font-semibold text-link underline-offset-4 hover:underline">Clear filters</a>
    {/if}
  </div>
</form>
