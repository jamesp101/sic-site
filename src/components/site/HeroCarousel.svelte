<script lang="ts">
  import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { readingOrder, safeHref } from '@/lib/carousel-overlay';
  import type { CarouselSlide } from '@/lib/content-types';
  import SlideLayer from './SlideLayer.svelte';

  let {
    slides,
    label = 'Featured highlights',
    pageTitle,
    eyebrow,
    tall = true,
  }: {
    slides: CarouselSlide[];
    label?: string;
    /** Visually hidden h1 for pages whose visible h1 is not part of the carousel. */
    pageTitle?: string;
    /** Small label above each slide title (department pages). */
    eyebrow?: string;
    /** Home height (600px) vs department height (450px). */
    tall?: boolean;
  } = $props();

  /** Time each slide stays up while autoplaying; the active dot's progress bar runs for this long. */
  const SLIDE_MS = 7000;
  /** Minimum horizontal travel for a touch swipe. */
  const SWIPE_PX = 48;

  let root: HTMLElement;
  const slideEls: HTMLElement[] = [];

  let current = $state(0);
  /** The slide fading out, kept zoomed so its photo does not jump while it disappears. */
  let previous = $state(-1);
  let mounted = $state(false);
  let userPaused = $state(false);
  let hovering = $state(false);
  let focused = $state(false);
  let reducedMotion = $state(false);
  let inView = $state(true);
  let pageVisible = $state(true);
  /** Slides whose photo may load besides the first: the current slide and its neighbours. */
  const loaded = new SvelteSet<CarouselSlide['id']>();

  const multiple = $derived(slides.length > 1);
  const canAutoplay = $derived(mounted && multiple && !reducedMotion);
  const autoplay = $derived(canAutoplay && !userPaused && !hovering && !focused && inView && pageVisible);
  const pad = (n: number) => String(n).padStart(2, '0');

  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = media.matches;
    const onMotion = () => (reducedMotion = media.matches);
    media.addEventListener('change', onMotion);

    const onVisibility = () => (pageVisible = document.visibilityState === 'visible');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);

    const observer = new IntersectionObserver(([entry]) => (inView = entry.isIntersecting), { threshold: 0.25 });
    observer.observe(root);

    mounted = true;
    return () => {
      media.removeEventListener('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
    };
  });

  // Fetch the photos around the current slide ahead of time instead of all of them at page load.
  $effect(() => {
    if (!mounted) return;
    for (const offset of [0, 1, -1]) loaded.add(slides[(current + offset + slides.length) % slides.length].id);
  });

  function go(index: number) {
    const target = (index + slides.length) % slides.length;
    if (target === current) return;
    // The old slide turns inert, which drops focus; carry keyboard users to the new slide.
    const focusInside = slideEls[current]?.contains(document.activeElement) ?? false;
    previous = current;
    current = target;
    if (focusInside) tick().then(() => slideEls[current]?.focus());
  }
  const next = () => go(current + 1);
  const prev = () => go(current - 1);

  function onkeydown(event: KeyboardEvent) {
    if (!multiple || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: slides.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    go(target);
  }

  // Touch swipe. `touch-action: pan-y` leaves vertical scrolling to the browser.
  let swipe: { id: number; x: number; y: number } | null = null;
  function onpointerdown(event: PointerEvent) {
    if (!multiple || event.pointerType === 'mouse' || !event.isPrimary) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onpointerup(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) next();
    else prev();
  }

  const arrow =
    'absolute top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-brand-950/40 text-white backdrop-blur-sm transition hover:border-white/40 hover:bg-brand-950/75 md:inline-flex';
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  bind:this={root}
  aria-roledescription="carousel"
  aria-label={label}
  class="hero relative w-full overflow-hidden bg-brand-950 {tall ? '' : 'hero-short'}"
  onpointerenter={(event) => event.pointerType === 'mouse' && (hovering = true)}
  onpointerleave={(event) => event.pointerType === 'mouse' && (hovering = false)}
  onfocusin={(event) => (focused = (event.target as Element).matches(':focus-visible'))}
  onfocusout={() => (focused = false)}
  {onkeydown}
  {onpointerdown}
  {onpointerup}
  onpointercancel={() => (swipe = null)}
>
  {#if pageTitle}<h1 class="sr-only">{pageTitle}</h1>{/if}

  <div aria-live={autoplay ? 'off' : 'polite'} class="h-full">
    {#each slides as slide, index (slide.id)}
      <div
        bind:this={slideEls[index]}
        role="group"
        aria-roledescription="slide"
        aria-label="{index + 1} of {slides.length}"
        tabindex="-1"
        inert={index !== current}
        class="slide absolute inset-0 transition-opacity duration-1000 ease-in-out focus-visible:ring-inset focus-visible:ring-offset-0 {index ===
        current
          ? 'z-10 opacity-100'
          : 'z-0 opacity-0'}"
        class:is-active={index === current}
      >
        <img
          src={index === 0 || loaded.has(slide.id) ? slide.imageUrl : undefined}
          alt=""
          width="1920"
          height="1080"
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchpriority={index === 0 ? 'high' : undefined}
          decoding="async"
          class="photo absolute inset-0 h-full w-full object-cover"
          class:zoom={index === current || index === previous}
          style:transform-origin={index % 2 ? '70% 60%' : '30% 40%'}
        />
        <div class="absolute inset-0 bg-linear-to-t from-brand-950/90 via-brand-950/45 to-brand-950/30 md:from-brand-950/85"></div>
        {#if slide.overlay}
          <!-- Designer slide: real, server-rendered text, links and images positioned over the picture. -->
          <div class="stage rise">
            {#each readingOrder(slide.overlay) as { layer, z } (layer.id)}
              <SlideLayer {layer} {z} />
            {/each}
          </div>
        {:else}
          <div class="absolute inset-0 hidden bg-linear-to-r from-brand-950/70 via-brand-950/25 to-transparent md:block"></div>
          <div class="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-20 text-white md:justify-center md:px-24 md:pb-0">
            <div class="rise max-w-2xl space-y-4">
              {#if eyebrow}
                <p class="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold-300 before:h-0.5 before:w-8 before:rounded-sm before:bg-gold-500 before:content-['']">
                  {eyebrow}
                </p>
              {/if}
              {#if slide.title}
                <p class="font-serif text-4xl font-bold leading-tight tracking-tight text-balance md:text-6xl">
                  {slide.title}
                </p>
              {/if}
              {#if slide.subtitle}
                <p class="text-lg text-white/90 md:text-xl">{slide.subtitle}</p>
              {/if}
              {#if slide.linkUrl && safeHref(slide.linkUrl)}
                <p class="pt-2">
                  <a
                    href={safeHref(slide.linkUrl) ?? undefined}
                    class="inline-flex min-h-12 items-center gap-2 rounded-xl bg-gold-500 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-brand-950 shadow-brand-md transition hover:-translate-y-0.5 hover:bg-gold-400"
                  >
                    Explore more<span class="sr-only">: {slide.title ?? 'slide ' + (index + 1)}</span>
                    <span aria-hidden="true">&rarr;</span>
                  </a>
                </p>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if multiple && mounted}
    <button type="button" class="{arrow} left-6" aria-label="Previous slide" onclick={prev}>
      <ChevronLeft class="h-6 w-6" aria-hidden="true" />
    </button>
    <button type="button" class="{arrow} right-6" aria-label="Next slide" onclick={next}>
      <ChevronRight class="h-6 w-6" aria-hidden="true" />
    </button>

    <div class="absolute inset-x-0 bottom-4 z-20 flex justify-center px-4 md:bottom-6">
      <div class="flex items-center gap-1 rounded-full bg-brand-950/45 py-1 pl-1 pr-4 text-white backdrop-blur-sm">
        {#if !reducedMotion}
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-white/15"
            aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
            onclick={() => (userPaused = !userPaused)}
          >
            {#if userPaused}
              <Play class="h-4 w-4" aria-hidden="true" />
            {:else}
              <Pause class="h-4 w-4" aria-hidden="true" />
            {/if}
          </button>
        {:else}
          <span class="w-3" aria-hidden="true"></span>
        {/if}
        <div class="flex">
          {#each slides as slide, index (slide.id)}
            <button
              type="button"
              class="group flex h-10 items-center px-1"
              aria-label="Go to slide {index + 1}"
              aria-current={index === current ? 'true' : undefined}
              onclick={() => go(index)}
            >
              <span
                class="relative block h-1.5 overflow-hidden rounded-full transition-all duration-300 {index === current
                  ? 'w-10 bg-white/30'
                  : 'w-5 bg-white/50 group-hover:bg-white/80'}"
              >
                {#if index === current}
                  <!-- Autoplay is driven by this bar: when it fills up, the next slide shows. -->
                  <span
                    class="progress absolute inset-0 origin-left rounded-full bg-gold-400"
                    class:timed={canAutoplay}
                    class:running={autoplay}
                    style:animation-duration="{SLIDE_MS}ms"
                    onanimationend={next}
                  ></span>
                {/if}
              </span>
            </button>
          {/each}
        </div>
        <span class="ml-2 text-xs font-semibold tabular-nums tracking-widest text-white/85" aria-hidden="true">
          {pad(current + 1)}<span class="px-1 text-white/50">/</span><span class="text-white/50">{pad(slides.length)}</span>
        </span>
      </div>
    </div>
  {/if}
</section>

<style>
  /*
   * The hero is a size container named "hero". Overlay layers live on a 16:9 stage that covers it
   * exactly like the object-cover photo, so percentages match the editor. Below 48rem the stage
   * becomes a bottom-aligned column and layers stack in reading order (see SlideLayer).
   */
  .hero {
    container: hero / inline-size;
    height: var(--hh);
    touch-action: pan-y;
    --hh: 500px;
  }
  .hero-short {
    --hh: 400px;
  }
  @media (min-width: 48rem) {
    .hero {
      --hh: 600px;
    }
    .hero-short {
      --hh: 450px;
    }
  }
  .stage {
    position: absolute;
    left: 50%;
    top: 50%;
    width: max(100cqw, calc(var(--hh) * 16 / 9));
    aspect-ratio: 16 / 9;
    transform: translate(-50%, -50%);
    container-type: inline-size;
    --min-fs: 0.75rem;
  }
  @container hero (max-width: 47.99rem) {
    .stage {
      inset: 0;
      transform: none;
      width: auto;
      aspect-ratio: auto;
      container-type: normal;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 0.75rem;
      padding: 1.5rem 1.5rem 5rem;
    }
  }

  /* Slow zoom on the visible photo; the outgoing photo keeps its zoom while it fades out. */
  .photo.zoom {
    animation: ken-burns 12s ease-out both;
  }
  @keyframes ken-burns {
    from {
      transform: scale(1);
    }
    to {
      transform: scale(1.08);
    }
  }

  /*
   * Text and layers rise in, one after another, every time their slide becomes active.
   * `translate` composes with the layers' own `transform`, so designer rotations are kept.
   */
  .is-active .rise > :global(*) {
    animation: rise 0.9s cubic-bezier(0.2, 0.7, 0.2, 1) 0.75s both;
  }
  .is-active .rise > :global(:nth-child(1)) {
    animation-delay: 0.3s;
  }
  .is-active .rise > :global(:nth-child(2)) {
    animation-delay: 0.42s;
  }
  .is-active .rise > :global(:nth-child(3)) {
    animation-delay: 0.54s;
  }
  .is-active .rise > :global(:nth-child(4)) {
    animation-delay: 0.66s;
  }
  @keyframes rise {
    from {
      opacity: 0;
      translate: 0 1.25rem;
    }
  }

  .progress.timed {
    animation-name: progress;
    animation-timing-function: linear;
    animation-fill-mode: both;
    animation-play-state: paused;
  }
  .progress.running {
    animation-play-state: running;
  }
  @keyframes progress {
    from {
      transform: scaleX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .photo.zoom,
    .is-active .rise > :global(*) {
      animation: none;
    }
  }
</style>
