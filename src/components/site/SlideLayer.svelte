<script lang="ts">
  import {
    ALIGN_CLASS,
    BG_COLOR_CLASS,
    BORDER_COLOR_CLASS,
    ON_COLOR_CLASS,
    RADIUS_CLASS,
    TYPE_SCALE,
    scaleKind,
    TEXT_COLOR_AUTO_CLASS,
    TEXT_COLOR_CLASS,
    TYPE_LABEL,
    layerLabel,
    relFor,
    type ColorKey,
    type Layer,
  } from '@/lib/carousel-overlay';
  import type { MobileBox } from '@/lib/carousel-overlay-mobile';

  let {
    layer,
    z,
    preview = false,
    interactive = false,
    box = null,
    view = 'desktop',
  }: {
    layer: Layer;
    /** Stacking order (1 = bottom). */
    z: number;
    /** Admin canvas: every layer is a plain focusable box, links and images are inert. */
    preview?: boolean;
    interactive?: boolean;
    /** Phone box of the layer (resolveMobile). The public slide switches to it below `sm` with container queries. */
    box?: MobileBox | null;
    /** Designer only: which layout the canvas shows. */
    view?: 'desktop' | 'mobile';
  } = $props();

  const DARK: ColorKey[] = ['navy', 'navy-deep', 'foreground', 'surface'];
  const mobilePreview = $derived(preview && view === 'mobile' && box !== null);

  const style = $derived.by(() => {
    const parts = [`z-index:${z}`];
    if (mobilePreview && box) {
      parts.push(`left:${box.x}%`, `top:${box.y}%`);
      if (!box.autoW) parts.push(`width:${box.w}%`);
      if (!box.autoH) parts.push(`height:${box.h}%`);
      if (box.fs !== null) parts.push(`--fs:${box.fs}`);
      // Hidden layers stay reachable in the designer as ghosts; automatic layers are always fully opaque.
      const opacity = box.hidden ? 0.3 : box.auto ? 1 : layer.opacity / 100;
      if (opacity < 1) parts.push(`opacity:${opacity}`);
      return parts.join(';');
    }
    parts.push(`left:${layer.x}%`, `top:${layer.y}%`);
    if ('w' in layer) parts.push(`width:${layer.w}%`);
    if ('h' in layer) parts.push(`height:${layer.h}%`);
    if (layer.opacity < 100) parts.push(`opacity:${layer.opacity / 100}`);
    if (layer.rotation) parts.push(`transform:rotate(${layer.rotation}deg)`);
    const kind = scaleKind(layer);
    if (kind && 'size' in layer) parts.push(`--fs:${TYPE_SCALE[kind][layer.size]}`);
    if (box && !preview) {
      parts.push(`--mx:${box.x}%`, `--my:${box.y}%`, `--mw:${box.autoW ? 'auto' : `${box.w}%`}`);
      parts.push(`--mh:${box.autoH ? 'auto' : `${box.h}%`}`);
      if (box.fs !== null) parts.push(`--mfs:${box.fs}`);
    }
    return parts.join(';');
  });

  /** Phone modifiers (public slide): container queries below `sm` read the custom properties above. */
  const phone = $derived(box && !preview ? (box.hidden ? 'sl-mhide' : `sl-m ${box.auto ? 'sl-mauto' : ''}`) : '');

  /** Text colour class: automatically stacked layers turn dark colours white on phones (see carousel-overlay.ts). */
  function textColor(color: ColorKey): string {
    if (mobilePreview && box?.auto && DARK.includes(color)) return 'text-white';
    return box?.auto && !preview ? TEXT_COLOR_AUTO_CLASS[color] : TEXT_COLOR_CLASS[color];
  }

  const textClass = $derived(
    layer.type === 'text'
      ? [
          'sl sl-fs sl-text', phone,
          ALIGN_CLASS[layer.align],
          textColor(layer.color),
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
            : `border-current ${textColor(layer.color)}`,
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
    class="{previewClass} cursor-grab select-none {mobilePreview && box?.hidden ? 'outline-1 outline-dashed outline-white' : ''}"
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
    font-size: max(var(--min-fs, 0px), calc(var(--fs) * 1cqw));
  }
  :global(.sl-img) {
    display: block;
  }

  /*
   * Below `sm` (40rem) the slide is a 4:5 frame (see HeroCarousel) and every layer moves to its phone box
   * (`--mx`, `--my`, `--mw`, `--mh`, `--mfs`, resolved by resolveMobile). Rotation is dropped; layers that are
   * stacked automatically are fully opaque; hidden layers disappear.
   */
  @container hero (max-width: 39.99rem) {
    :global(.sl-m) {
      left: var(--mx) !important;
      top: var(--my) !important;
      width: var(--mw) !important;
      height: var(--mh) !important;
      transform: none !important;
    }
    :global(.sl-mauto) {
      opacity: 1 !important;
    }
    :global(.sl-mhide) {
      display: none !important;
    }
    :global(.sl-m.sl-fs) {
      font-size: max(var(--min-fs, 0px), calc(var(--mfs) * 1cqw));
    }
    :global(.sl-m.sl-img) {
      max-width: none;
    }
  }
</style>
