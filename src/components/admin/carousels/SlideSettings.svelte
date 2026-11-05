<script lang="ts">
  import { RotateCcw, Trash2, Upload } from '@lucide/svelte';
  import { parseVideoUrl } from '@/lib/blocks/urls';
  import { uploadVideo } from '../editor/upload';
  import ImageField from '../shared/ImageField.svelte';
  import { inputClass, secondaryButtonClass } from '../shared/form-utils';

  let {
    file = $bindable(null),
    savedImageUrl,
    imageError = '',
    showOnMain,
    departmentId,
    departments,
    superadmin,
    busy = false,
    onplacement,
    video,
    onvideo,
    focus,
    onfocus,
    mobileCustomized,
    onmobilereset,
  }: {
    /** Replacement image (already cropped to 16:9). */
    file: File | null;
    savedImageUrl: string | null;
    imageError?: string;
    showOnMain: boolean;
    departmentId: number | null;
    departments: { id: number; name: string }[];
    superadmin: boolean;
    busy?: boolean;
    onplacement: (patch: { showOnMain?: boolean; departmentId?: number | null }) => void;
    /** Background video: an uploaded file's URL or a YouTube link; '' = none. The photo stays the poster. */
    video: string;
    onvideo: (value: string) => void;
    /** Where the photo is centred in the phone's 4:5 crop (percent). */
    focus: { x: number; y: number };
    onfocus: (focus: { x: number; y: number }) => void;
    /** True when the slide has hand-placed phone layers or a focal point. */
    mobileCustomized: boolean;
    onmobilereset: () => void;
  } = $props();

  const source = $derived(video ? parseVideoUrl(video) : null);
  let link = $state('');
  let linkError = $state('');
  let uploading = $state(false);
  let progress = $state(0);
  let uploadError = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  // Follow the saved value when the open slide changes.
  $effect(() => {
    link = source?.provider === 'youtube' ? video : '';
    linkError = '';
  });

  function commitLink() {
    const value = link.trim();
    if (!value) {
      linkError = '';
      onvideo('');
    } else if (parseVideoUrl(value)?.provider === 'youtube') {
      linkError = '';
      onvideo(value);
    } else {
      linkError = 'Use a YouTube link, or upload an mp4 or webm video.';
    }
  }

  async function upload(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    uploadError = '';
    uploading = true;
    progress = 0;
    try {
      onvideo((await uploadVideo(file, (fraction) => (progress = fraction))).url);
    } catch (error) {
      uploadError = error instanceof Error ? error.message : 'The video could not be uploaded.';
    } finally {
      uploading = false;
    }
  }

  const range = 'h-8 w-full accent-brand-800';
</script>

<section aria-label="Slide settings" class="space-y-4">
  <h3 class="text-sm font-bold text-foreground">Slide</h3>

  <ImageField
    bind:file
    id="slide-image"
    target="slide"
    label="Slide image"
    required={!savedImageUrl}
    existingUrl={savedImageUrl}
    aspectRatio={16 / 9}
    cropTitle="Crop Slide Image (16:9)"
    hint="PNG, JPG, WebP or GIF (max 5 MB)"
    fit="cover"
    error={imageError}
  />

  <fieldset class="space-y-3 rounded-lg border border-border bg-surface-alt p-3" data-testid="slide-video">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Background video</legend>
    <p class="text-xs text-muted-foreground">
      Plays muted behind the text. The slide image above is required: it shows while the video loads, with reduced motion and on data saver.
    </p>
    {#if source?.provider === 'file'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={video} controls muted loop playsinline preload="metadata" aria-label="Background video preview" class="aspect-video w-full rounded-lg bg-brand-950"></video>
    {:else if source?.provider === 'youtube'}
      <iframe
        src="{source.embedUrl}?controls=1&rel=0"
        title="Background video preview"
        loading="lazy"
        allow="encrypted-media; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        class="aspect-video w-full rounded-lg bg-brand-950"
      ></iframe>
    {/if}
    {#if source?.provider !== 'file'}
      <div>
        <label for="slide-video-link" class="mb-1 block text-sm font-semibold text-foreground">YouTube link</label>
        <input
          id="slide-video-link"
          type="url"
          class={inputClass}
          placeholder="https://www.youtube.com/watch?v=…"
          bind:value={link}
          onchange={commitLink}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitLink();
            }
          }}
          aria-invalid={linkError ? 'true' : undefined}
          aria-describedby={linkError ? 'slide-video-link-error' : undefined}
        />
        {#if linkError}<p id="slide-video-link-error" class="mt-1 text-xs text-destructive" role="alert">{linkError}</p>{/if}
      </div>
    {/if}
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="{secondaryButtonClass} !px-3 !py-1.5 text-xs" disabled={uploading} onclick={() => fileInput?.click()}>
        <Upload class="h-4 w-4" aria-hidden="true" />
        {source?.provider === 'file' ? 'Replace video' : 'Upload video'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept="video/mp4,video/webm,.mp4,.webm"
        class="sr-only"
        tabindex="-1"
        aria-label="Choose an mp4 or webm video (max 100 MB)"
        onchange={upload}
      />
      {#if video}
        <button type="button" class="{secondaryButtonClass} !px-3 !py-1.5 text-xs !text-destructive" disabled={uploading} onclick={() => onvideo('')}>
          <Trash2 class="h-4 w-4" aria-hidden="true" /> Remove video
        </button>
      {/if}
    </div>
    <p class="text-xs text-muted-foreground">MP4 or WebM, up to 100 MB.</p>
    {#if uploading}
      <div role="progressbar" aria-label="Video upload" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)} class="h-2 overflow-hidden rounded-full bg-border">
        <div class="h-full bg-brand-700 transition-[width]" style:width="{Math.round(progress * 100)}%"></div>
      </div>
      <p class="text-xs text-muted-foreground" role="status">Uploading… {Math.round(progress * 100)}%</p>
    {/if}
    {#if uploadError}<p class="text-xs text-destructive" role="alert">{uploadError}</p>{/if}
  </fieldset>

  <fieldset class="space-y-3 rounded-lg border border-border bg-surface-alt p-3" data-testid="slide-phone">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone layout</legend>
    <p class="text-xs text-muted-foreground">
      On phones the slide is 4:5. Choose which part of the photo stays in view; edit the layers in the Mobile layout.
    </p>
    <div>
      <label for="slide-focus-x" class="mb-1 block text-xs font-semibold text-foreground">Photo focus, left to right ({Math.round(focus.x)}%)</label>
      <input id="slide-focus-x" type="range" min="0" max="100" step="1" value={focus.x} class={range} oninput={(event) => onfocus({ x: Number(event.currentTarget.value), y: focus.y })} />
    </div>
    <div>
      <label for="slide-focus-y" class="mb-1 block text-xs font-semibold text-foreground">Photo focus, top to bottom ({Math.round(focus.y)}%)</label>
      <input id="slide-focus-y" type="range" min="0" max="100" step="1" value={focus.y} class={range} oninput={(event) => onfocus({ x: focus.x, y: Number(event.currentTarget.value) })} />
    </div>
    <button type="button" class="{secondaryButtonClass} w-full !px-3 !py-1.5 text-xs" disabled={!mobileCustomized} onclick={onmobilereset}>
      <RotateCcw class="h-4 w-4" aria-hidden="true" /> Reset phone layout to automatic
    </button>
  </fieldset>

  <fieldset class="space-y-3 rounded-lg border border-border bg-surface-alt p-3">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Where it appears</legend>
    <label class="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={showOnMain}
        disabled={busy}
        onchange={(event) => onplacement({ showOnMain: event.currentTarget.checked })}
        class="mt-0.5 h-4 w-4 rounded border-border-strong accent-brand-800"
      />
      <span class="flex flex-col">
        <span class="text-sm font-semibold text-foreground">Display on the main page</span>
        <span class="text-xs text-muted-foreground">Show this slide in the home page carousel.</span>
      </span>
    </label>
    <div>
      <label for="slide-department" class="mb-1 block text-sm font-semibold text-foreground">Department page</label>
      <select
        id="slide-department"
        class={inputClass}
        value={departmentId === null ? '' : String(departmentId)}
        disabled={!superadmin || busy}
        onchange={(event) => onplacement({ departmentId: event.currentTarget.value ? Number(event.currentTarget.value) : null })}
      >
        {#if superadmin}<option value="">None (main page only)</option>{/if}
        {#each departments as department (department.id)}
          <option value={String(department.id)}>{department.name}</option>
        {/each}
      </select>
    </div>
  </fieldset>
</section>
