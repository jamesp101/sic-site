<script lang="ts">
  import type { Snippet } from 'svelte';
  import SlideLayer from '@/components/site/SlideLayer.svelte';
  import type { Layer } from '@/lib/carousel-overlay';

  let {
    imageUrl,
    layers,
    interactive = false,
    element = $bindable(null),
    label = 'Slide canvas',
    children,
  }: {
    imageUrl: string | null;
    layers: Layer[];
    /** Canvas: layers are focusable. Thumbnails: purely decorative. */
    interactive?: boolean;
    element?: HTMLDivElement | null;
    label?: string;
    /** Selection outlines, guides and other editor chrome drawn above the layers. */
    children?: Snippet;
  } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- The stage is a container so layer sizes (cqw) scale exactly like on the public slide. -->
<div
  bind:this={element}
  class="relative aspect-video w-full overflow-hidden bg-brand-900 [container-type:inline-size] {interactive ? 'touch-none outline-none' : ''}"
  role={interactive ? 'group' : undefined}
  tabindex={interactive ? -1 : undefined}
  aria-label={interactive ? label : undefined}
  aria-hidden={interactive ? undefined : 'true'}
>
  {#if imageUrl}
    <img src={imageUrl} alt="" draggable="false" class="pointer-events-none absolute inset-0 h-full w-full object-cover" />
  {/if}
  <div class="pointer-events-none absolute inset-0 bg-linear-to-t from-brand-950/85 via-brand-950/45 to-brand-950/30"></div>
  {#each layers as layer, index (layer.id)}
    <SlideLayer {layer} z={index + 1} preview {interactive} />
  {/each}
  {@render children?.()}
</div>
