<script lang="ts">
  import {
    ALIGN_CLASS,
    BG_COLOR_CLASS,
    BORDER_COLOR_CLASS,
    ON_COLOR_CLASS,
    RADIUS_CLASS,
    SIZE_CQW,
    TEXT_COLOR_CLASS,
    TYPE_LABEL,
    layerLabel,
    relFor,
    type Layer,
  } from '@/lib/carousel-overlay';

  let {
    layer,
    z,
    preview = false,
    interactive = false,
  }: {
    layer: Layer;
    /** Stacking order (1 = bottom). */
    z: number;
    /** Admin canvas: every layer is a plain focusable box, links and images are inert. */
    preview?: boolean;
    interactive?: boolean;
  } = $props();

  const style = $derived.by(() => {
    const parts = [`left:${layer.x}%`, `top:${layer.y}%`, `z-index:${z}`];
    if ('w' in layer) parts.push(`width:${layer.w}%`);
    if ('h' in layer) parts.push(`height:${layer.h}%`);
    if (layer.opacity < 100) parts.push(`opacity:${layer.opacity / 100}`);
    if (layer.rotation) parts.push(`transform:rotate(${layer.rotation}deg)`);
    if ('size' in layer) parts.push(`--fs:${SIZE_CQW[layer.size]}`);
    return parts.join(';');
  });

  const textClass = $derived(
    layer.type === 'text'
      ? [
          'sl sl-fs sl-text',
          ALIGN_CLASS[layer.align],
          TEXT_COLOR_CLASS[layer.color],
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
          'sl sl-fs inline-flex items-center gap-[0.6em] rounded-xl px-[1.5em] py-[0.8em] font-semibold uppercase tracking-widest leading-none',
          layer.variant === 'solid'
            ? `${BG_COLOR_CLASS[layer.color]} ${ON_COLOR_CLASS[layer.color]} shadow-brand-md`
            : `border-2 border-current ${TEXT_COLOR_CLASS[layer.color]}`,
          !preview && 'transition hover:-translate-y-0.5',
        ]
          .filter(Boolean)
          .join(' ')
      : '',
  );

  const badgeClass = $derived(
    layer.type === 'badge'
      ? `sl sl-fs inline-block rounded-full px-[0.9em] py-[0.35em] font-semibold uppercase leading-none tracking-wider ${BG_COLOR_CLASS[layer.color]} ${ON_COLOR_CLASS[layer.color]}`
      : '',
  );

  const shapeClass = $derived(
    layer.type === 'shape' ? `sl sl-shape ${BG_COLOR_CLASS[layer.color]} ${RADIUS_CLASS[layer.radius]}` : '',
  );
  const imageClass = $derived(layer.type === 'image' ? `sl sl-img ${RADIUS_CLASS[layer.radius]}` : '');

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
    class="{previewClass} cursor-grab select-none"
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

<style>
  :global(.sl) {
    position: absolute;
    margin: 0;
  }
  :global(.sl-fs) {
    /* --min-fs is set by the public carousel (12 px floor); the admin canvas stays exact. */
    font-size: max(var(--min-fs, 0px), calc(var(--fs) * 1cqw));
  }
  :global(.sl-img) {
    display: block;
  }

  /* Narrow slides: the 16:9 composition does not fit, so layers stack in reading order. */
  @container hero (max-width: 47.99rem) {
    :global(.sl) {
      position: static;
      width: auto !important;
      height: auto !important;
      max-width: 100%;
      transform: none !important;
      opacity: 1 !important;
      align-self: flex-start;
    }
    :global(.sl-text) {
      align-self: stretch;
    }
    :global(.sl-fs) {
      font-size: clamp(0.875rem, calc(var(--fs) * 2.4cqw), 2.75rem);
    }
    :global(.sl-shape) {
      display: none;
    }
    :global(.sl-img) {
      height: 3rem !important;
      width: auto !important;
      max-width: 40%;
    }
  }
</style>
