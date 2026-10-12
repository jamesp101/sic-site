<script lang="ts">
  import { Pencil, RefreshCw, Search } from '@lucide/svelte';
  import DeleteCarouselButton from './DeleteCarouselButton.svelte';
  import { inputClass, secondaryButtonClass } from '../shared/form-utils';

  interface Slide {
    id: number;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
    order: number;
    departmentId: number | null;
    departmentName: string | null;
    showOnMain: boolean;
    imageUrl: string;
  }

  let { slides, departments, canFilterDepartment }: { slides: Slide[]; departments: { id: number; name: string }[]; canFilterDepartment: boolean } = $props();

  let query = $state('');
  let department = $state('');

  const visible = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return slides
      .filter((slide) => {
        if (department === 'main' && slide.departmentId !== null) return false;
        if (department && department !== 'main' && String(slide.departmentId) !== department) return false;
        if (!needle) return true;
        return [slide.title, slide.subtitle, slide.linkUrl].some((value) => value?.toLowerCase().includes(needle));
      })
      .sort((a, b) => a.order - b.order);
  });

  function reset() {
    query = '';
    department = '';
  }
</script>

<div class="space-y-4">
  <div class="flex flex-col items-stretch gap-3 rounded-xl border border-border bg-card p-4 shadow-brand-sm md:flex-row md:items-center">
    <div class="relative w-full md:max-w-xs">
      <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" bind:value={query} placeholder="Search title, subtitle, link…" aria-label="Search slides" class={[inputClass, 'pl-9']} />
    </div>
    {#if canFilterDepartment}
      <select bind:value={department} aria-label="Filter by department" class={[inputClass, 'md:max-w-xs']}>
        <option value="">All slides</option>
        <option value="main">Main page only</option>
        {#each departments as item (item.id)}
          <option value={String(item.id)}>{item.name}</option>
        {/each}
      </select>
    {/if}
    <button type="button" onclick={reset} class={[secondaryButtonClass, 'text-xs']}>
      <RefreshCw class="h-3.5 w-3.5" aria-hidden="true" /> Reset
    </button>
  </div>

  <div class="overflow-hidden rounded-xl border border-border bg-card shadow-brand-sm">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-border bg-surface-alt text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <th scope="col" class="w-40 px-6 py-4">Slide</th>
            <th scope="col" class="px-6 py-4">Content</th>
            <th scope="col" class="px-6 py-4">Placement</th>
            <th scope="col" class="w-24 px-6 py-4">Order</th>
            <th scope="col" class="w-28 px-6 py-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          {#each visible as slide (slide.id)}
            <tr class="hover:bg-surface-alt/60">
              <td class="px-6 py-3">
                <img src={slide.imageUrl} alt="" class="aspect-video w-32 rounded-md border border-border-strong object-cover" loading="lazy" />
              </td>
              <td class="px-6 py-3">
                <p class="font-semibold text-foreground">{slide.title || 'Untitled slide'}</p>
                {#if slide.subtitle}<p class="text-xs text-muted-foreground">{slide.subtitle}</p>{/if}
                {#if slide.linkUrl}<p class="mt-1 font-mono text-xs text-link">{slide.linkUrl}</p>{/if}
              </td>
              <td class="px-6 py-3">
                <div class="flex flex-wrap gap-1.5 text-xs font-semibold">
                  {#if slide.departmentName}
                    <span class="rounded-full bg-status-announcement-bg px-2 py-0.5 text-status-announcement-fg">{slide.departmentName}</span>
                  {/if}
                  {#if slide.showOnMain}
                    <span class="rounded-full bg-status-event-bg px-2 py-0.5 text-status-event-fg">Main page</span>
                  {/if}
                  {#if !slide.departmentName && !slide.showOnMain}
                    <span class="rounded-full bg-file-other-bg px-2 py-0.5 text-file-other-fg">Hidden</span>
                  {/if}
                </div>
              </td>
              <td class="px-6 py-3 font-mono text-xs">#{slide.order}</td>
              <td class="px-6 py-3">
                <div class="flex justify-end gap-1.5">
                  <a
                    href={`/admin/carousels/${slide.id}/edit`}
                    class="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                    aria-label={`Edit slide ${slide.title ?? slide.id}`}
                    title="Edit slide"
                  >
                    <Pencil class="h-4 w-4" aria-hidden="true" />
                  </a>
                  <DeleteCarouselButton id={slide.id} name={slide.title ?? String(slide.id)} />
                </div>
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5" class="px-6 py-12 text-center italic text-muted-foreground">No slides match your criteria.</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
