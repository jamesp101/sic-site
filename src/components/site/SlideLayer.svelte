<script lang="ts">
  import {
    ALIGN_CLASS,
    BG_COLOR_CLASS,
    ON_COLOR_CLASS,
    RADIUS_CLASS,
    TYPE_LABEL,
    layerLabel,
    relFor,
    type Layer,
  } from '@/lib/carousel-overlay';
  import { layerPresentation, type SlideMode } from '@/lib/carousel-layout';
  import type { MobileBox } from '@/lib/carousel-overlay-mobile';

  let {
    layer,
    z,
    mode = 'public',
    interactive = false,
    box = null,
  }: {
    layer: Layer;
    /** Stacking order (1 = bottom). */
    z: number;
    /** `public` renders real elements (headings, links); the designer modes render inert, focusable boxes. */
    mode?: SlideMode;
    interactive?: boolean;
    /** Phone box of the layer (resolveMobile). */
    box?: MobileBox | null;
  } = $props();

  const preview = $derived(mode !== 'public');
  const look = $derived(layerPresentation(layer, z, box, mode));
  const style = $derived(look.style);
  const phone = $derived(look.phoneClass);
  const textColor = $derived(look.textColor);

  const textClass = $derived(
    layer.type === 'text'
      ? [
          'sl sl-fs sl-text', phone,
          ALIGN_CLASS[layer.align],
          textColor,
          'whitespace-pre-line break-words',
          // Serif is reserved for headings (h1/h2) by the design rules.
          layer.role === 'heading' && layer.font === 'serif' ? 'font-serif' : 'font-sans',
          layer.role === 'heading' ? 'font-bold leading-tight tracking-tight' : 'leading-snug',
        ].join(' ')
      : '',
  );

  const buttonClass = $derived(
    layer.type === 'button'
      ? [
          'sl sl-fs', phone, 'inline-flex min-w-[10em] items-center justify-center gap-[0.6em] rounded-xl border-2 px-[1.5em] py-[0.8em] font-semibold uppercase tracking-widest leading-none',
          layer.variant === 'solid'
            ? `border-transparent ${BG_COLOR_CLASS[layer.color]} ${ON_COLOR_CLASS[layer.color]} shadow-brand-md`
            : `border-current ${textColor}`,
          !preview && 'transition hover:-translate-y-0.5',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
  );

  const badgeClass = $derived(
    layer.type === 'badge'
      ? `sl sl-fs ${phone} inline-block rounded-full px-[0.9em] py-[0.35em] font-semibold uppercase leading-none tracking-wider ${BG_COLOR_CLASS[layer.color]} ${ON_COLOR_CLASS[layer.color]}`
      : '',
  );

  const shapeClass = $derived(
    layer.type === 'shape' ? `sl sl-shape ${phone} ${BG_COLOR_CLASS[layer.color]} ${RADIUS_CLASS[layer.radius]}` : '',
  );
  const imageClass = $derived(layer.type === 'image' ? `sl sl-img ${phone} ${RADIUS_CLASS[layer.radius]}` : '');

  const previewClass = $derived(
    layer.type === 'text'
      ? textClass
      : layer.type === 'button'
        ? buttonClass
        : layer.type === 'badge'
          ? badgeClass
          : layer.type === 'shape'
            ? shapeClass
            : imageClass,
  );
</script>

{#if preview}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div
    class="{previewClass} cursor-grab select-none {look.ghostClass}"
    {style}
    data-layer-id={layer.id}
    role={interactive ? 'button' : undefined}
    tabindex={interactive ? 0 : undefined}
    aria-label={interactive ? `${TYPE_LABEL[layer.type]}: ${layerLabel(layer)}` : undefined}
  >
    {#if layer.type === 'text'}
      {layer.text}
    {:else if layer.type === 'button'}
      {layer.label}<span aria-hidden="true">&rarr;</span>
    {:else if layer.type === 'badge'}
      {layer.text}
    {:else if layer.type === 'image'}
      <img src={layer.src} alt="" draggable="false" class="pointer-events-none h-full w-full object-contain {RADIUS_CLASS[layer.radius]}" />
    {/if}
  </div>
{:else if layer.type === 'text'}
  {#if layer.role === 'heading'}
    <h2 class={textClass} {style}>{layer.text}</h2>
  {:else}
    <p class={textClass} {style}>{layer.text}</p>
  {/if}
{:else if layer.type === 'button'}
  <a href={layer.href} rel={relFor(layer.href)} class={buttonClass} {style}>
    {layer.label}<span aria-hidden="true">&rarr;</span>
  </a>
{:else if layer.type === 'badge'}
  <span class={badgeClass} {style}>{layer.text}</span>
{:else if layer.type === 'shape'}
  <div class={shapeClass} {style} aria-hidden="true"></div>
{:else}
  <img src={layer.src} alt={layer.alt} loading="lazy" decoding="async" class="{imageClass} object-contain" {style} />
{/if}
