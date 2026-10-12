<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import type { NavNode } from '@/lib/nav-tree';

  let { tree }: { tree: NavNode[] } = $props();

  const visible = $derived(
    tree
      .filter((top) => top.isActive)
      .map((top) => ({ ...top, children: top.children.filter((child) => child.isActive) })),
  );
</script>

<section aria-labelledby="nav-preview-title" class="space-y-3 rounded-xl border border-border-strong bg-surface p-4 shadow-brand-sm">
  <h2 id="nav-preview-title" class="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live header preview</h2>
  <div class="rounded-lg bg-linear-to-r from-brand-800 to-brand-700 p-3 text-white shadow-brand-md">
    {#if visible.length === 0}
      <p class="text-xs text-white/80">No visible links. The site shows its default menu.</p>
    {:else}
      <ul class="flex flex-wrap items-start gap-x-4 gap-y-3 text-xs font-semibold" data-testid="nav-preview">
        {#each visible as top (top.id)}
          <li class="min-w-0">
            <span class="flex items-center gap-1 border-b-2 border-gold-500 pb-0.5">
              <span class="truncate">{top.label}</span>
              {#if top.children.length > 0}<ChevronDown class="h-3 w-3" aria-hidden="true" />{/if}
            </span>
            {#if top.children.length > 0}
              <ul class="mt-1 space-y-0.5 rounded-md border border-white/10 bg-brand-900/60 p-1.5 font-normal">
                {#each top.children as child (child.id)}
                  <li class="truncate px-1 text-white/90">{child.label}</li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">Hidden links are left out. Sub-links appear in a dropdown under their parent.</p>
</section>
