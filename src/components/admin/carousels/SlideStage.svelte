<script lang="ts">
  import type { Snippet } from 'svelte';
  import SlideLayer from '@/components/site/SlideLayer.svelte';
  import { FRAME_ASPECT_CLASS } from '@/lib/carousel-layout';
  import type { Layer } from '@/lib/carousel-overlay';
  import type { MobileBox } from '@/lib/carousel-overlay-mobile';

  let {
    imageUrl,
    layers,
    interactive = false,
    element = $bindable(null),
    label = 'Slide canvas',
    view = 'desktop',
    focus = { x: 50, y: 50 },
    boxes = null,
    children,
  }: {
    imageUrl: string | null;
    layers: Layer[];
    /** Canvas: layers are focusable. Thumbnails: purely decorative. */
    interactive?: boolean;
    element?: HTMLDivElement | null;
    label?: string;
    /** `mobile` draws the 4:5 phone frame with the layers at their phone boxes. */
    view?: 'desktop' | 'mobile';
    /** Photo focal point (percent) used for the 4:5 crop. */
    focus?: { x: number; y: number };
    /** Phone boxes by layer id (resolveMobile); needed for the mobile view. */
    boxes?: Map<string, MobileBox> | null;
    /** Selection outlines, guides and other editor chrome drawn above the layers. */
    children?: Snippet;
  } = $props();

  const frame = $derived(view === 'mobile' ? FRAME_ASPECT_CLASS.phone : FRAME_ASPECT_CLASS.desktop);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- The stage is a container so layer sizes (cqw) scale exactly like on the public slide. -->
<div
  bind:this={element}
  class="relative w-full overflow-hidden {frame} bg-brand-900 [container-type:inline-size] {interactive ? 'touch-none outline-none' : ''}"
  role={interactive ? 'group' : undefined}
  tabindex={interactive ? -1 : undefined}
  aria-label={interactive ? label : undefined}
  aria-hidden={interactive ? undefined : 'true'}
>
  {#if imageUrl}
    <img src={imageUrl} alt="" draggable="false" class="pointer-events-none absolute inset-0 h-full w-full object-cover" style:object-position={view === 'mobile' ? `${focus.x}% ${focus.y}%` : undefined} />
  {/if}
  <div class="pointer-events-none absolute inset-0 bg-linear-to-t from-brand-950/85 via-brand-950/45 to-brand-950/30"></div>
  {#each layers as layer, index (layer.id)}
    <SlideLayer {layer} z={index + 1} mode={view === 'mobile' ? 'phone' : 'desktop'} {interactive} box={boxes?.get(layer.id) ?? null} />
  {/each}
  {@render children?.()}
</div>
