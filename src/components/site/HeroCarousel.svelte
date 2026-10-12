<script lang="ts">
  import { ChevronLeft, ChevronRight, Pause, Play } from '@lucide/svelte';
  import { onMount } from 'svelte';
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

  let current = $state(0);
  let mounted = $state(false);
  let userPaused = $state(false);
  let hovering = $state(false);
  let focused = $state(false);
  let reducedMotion = $state(false);

  const multiple = $derived(slides.length > 1);
  const autoplay = $derived(mounted && multiple && !reducedMotion && !userPaused && !hovering && !focused);

  onMount(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = media.matches;
    const onChange = () => (reducedMotion = media.matches);
    media.addEventListener('change', onChange);
    mounted = true;
    return () => media.removeEventListener('change', onChange);
  });

  $effect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => next(), 6000);
    return () => clearInterval(timer);
  });

  function next() {
    current = (current + 1) % slides.length;
  }
  function prev() {
    current = (current - 1 + slides.length) % slides.length;
  }

  const control =
    'inline-flex items-center justify-center rounded-full bg-brand-950/50 p-3 text-white backdrop-blur-sm transition-colors hover:bg-brand-950/80';
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  aria-roledescription="carousel"
  aria-label={label}
  class="hero relative w-full overflow-hidden bg-brand-950 {tall ? '' : 'hero-short'}"
  onmouseenter={() => (hovering = true)}
  onmouseleave={() => (hovering = false)}
  onfocusin={() => (focused = true)}
  onfocusout={() => (focused = false)}
>
  {#if pageTitle}<h1 class="sr-only">{pageTitle}</h1>{/if}

  <div aria-live={autoplay ? 'off' : 'polite'} class="h-full">
    {#each slides as slide, index (slide.id)}
      <div
        role="group"
        aria-roledescription="slide"
        aria-label="{index + 1} of {slides.length}"
        inert={index !== current}
        class="absolute inset-0 transition-opacity duration-700 ease-in-out {index === current
          ? 'z-10 opacity-100'
          : 'z-0 opacity-0'}"
      >
        <img
          src={slide.imageUrl}
          alt=""
          width="1920"
          height="1080"
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchpriority={index === 0 ? 'high' : undefined}
          decoding="async"
          class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-linear-to-t from-brand-950/85 via-brand-950/45 to-brand-950/30"></div>
        {#if slide.overlay}
          <!-- Designer slide: real, server-rendered text, links and images positioned over the picture. -->
          <div class="stage">
            {#each readingOrder(slide.overlay) as { layer, z } (layer.id)}
              <SlideLayer {layer} {z} />
            {/each}
          </div>
        {:else}
          <div class="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-6 text-white">
            <div class="max-w-2xl space-y-4">
              {#if eyebrow}
                <p class="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold-300 before:h-0.5 before:w-8 before:rounded-sm before:bg-gold-500 before:content-['']">
                  {eyebrow}
                </p>
              {/if}
              {#if slide.title}
                <p class="animate-fade-in font-serif text-4xl font-bold leading-tight tracking-tight md:text-6xl">
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
                    class="inline-flex items-center gap-2 rounded-xl bg-gold-500 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-brand-950 shadow-brand-md transition hover:-translate-y-0.5 hover:bg-gold-400"
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
    <button type="button" class="{control} absolute left-4 top-1/2 z-20 -translate-y-1/2" aria-label="Previous slide" onclick={prev}>
      <ChevronLeft class="h-6 w-6" aria-hidden="true" />
    </button>
    <button type="button" class="{control} absolute right-4 top-1/2 z-20 -translate-y-1/2" aria-label="Next slide" onclick={next}>
      <ChevronRight class="h-6 w-6" aria-hidden="true" />
    </button>

    <div class="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-3">
      {#if !reducedMotion}
        <button
          type="button"
          class="{control} p-2"
          aria-label={userPaused ? 'Play slideshow' : 'Pause slideshow'}
          onclick={() => (userPaused = !userPaused)}
        >
          {#if userPaused}
            <Play class="h-4 w-4" aria-hidden="true" />
          {:else}
            <Pause class="h-4 w-4" aria-hidden="true" />
          {/if}
        </button>
      {/if}
      <div class="flex gap-2">
        {#each slides as slide, index (slide.id)}
          <button
            type="button"
            class="h-2 rounded-full transition-all {index === current ? 'w-8 bg-gold-500' : 'w-4 bg-white/50 hover:bg-white/80'}"
            aria-label="Go to slide {index + 1}"
            aria-current={index === current ? 'true' : undefined}
            onclick={() => (current = index)}
          ></button>
        {/each}
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
      padding: 1.5rem 1.5rem 4.5rem;
    }
  }
</style>
