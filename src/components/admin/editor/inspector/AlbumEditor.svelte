<script lang="ts">
  import { Upload } from '@lucide/svelte';
  import type { AlbumImage } from '../../../../lib/blocks/types';
  import { LIMITS } from '../../../../lib/blocks/types';
  import { safeImageSrc } from '../../../../lib/blocks/urls';
  import { secondaryButtonClass } from '../../shared/form-utils';
  import { uploadImage } from '../upload';
  import AddButton from './AddButton.svelte';
  import ItemToolbar from './ItemToolbar.svelte';
  import { moveItem, removeItem, replaceItem } from './list-utils';
  import { IMAGE_ACCEPT } from './options';
  import TextField from './TextField.svelte';

  let {
    idBase,
    ownerKey,
    images,
    onchange,
  }: {
    idBase: string;
    /** Identifies the edited block; an upload finishing after the selection changed is discarded. */
    ownerKey: string;
    images: AlbumImage[];
    onchange: (images: AlbumImage[]) => void;
  } = $props();

  let uploading = $state('');
  let errors = $state<string[]>([]);
  let fileInput = $state<HTMLInputElement | null>(null);
  let pasted = $state('');

  const full = $derived(images.length >= LIMITS.albumImages);

  async function onselect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    const startedFor = ownerKey;
    errors = [];
    const room = LIMITS.albumImages - images.length;
    if (files.length > room) {
      errors.push(`An album holds at most ${LIMITS.albumImages} images; ${files.length - room} not added.`);
    }
    let done = 0;
    for (const file of files.slice(0, Math.max(0, room))) {
      uploading = `Uploading ${done + 1} of ${Math.min(files.length, room)}…`;
      try {
        const uploaded = await uploadImage(file);
        if (startedFor !== ownerKey) return;
        // `images` is read after the await: edits made while uploading are kept.
        onchange([...images, { src: uploaded.url, alt: '', caption: '' }]);
      } catch (caught) {
        if (startedFor !== ownerKey) return;
        errors.push(`${file.name}: ${caught instanceof Error ? caught.message : 'Upload failed. Please try again.'}`);
      }
      done++;
    }
    uploading = '';
  }

  const pastedError = $derived(pasted.trim() && !safeImageSrc(pasted) ? 'Use an https:// image address.' : '');

  function addPasted() {
    const src = safeImageSrc(pasted);
    if (!src || full) return;
    onchange([...images, { src, alt: '', caption: '' }]);
    pasted = '';
  }
</script>

<div class="space-y-3">
  <div class="flex flex-wrap items-center gap-2">
    <input
      bind:this={fileInput}
      id={`${idBase}-files`}
      type="file"
      multiple
      accept={IMAGE_ACCEPT}
      class="sr-only"
      tabindex="-1"
      aria-label="Choose image files"
      onchange={onselect}
    />
    <button
      type="button"
      class={[secondaryButtonClass, 'px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-60']}
      disabled={full || uploading !== ''}
      onclick={() => fileInput?.click()}
    >
      <Upload class="h-4 w-4" aria-hidden="true" />
      Upload images
    </button>
  </div>
  <p class="text-xs text-muted-foreground">
    Choose several images at once (PNG, JPG, WebP, GIF or AVIF). {images.length} of {LIMITS.albumImages} used.
  </p>
  {#if uploading}<p role="status" class="text-xs text-muted-foreground">{uploading}</p>{/if}
  {#each errors as message, i (i)}<p role="alert" class="text-xs text-destructive">{message}</p>{/each}

  <div class="flex items-end gap-2">
    <div class="min-w-0 flex-1">
      <TextField
        id={`${idBase}-paste`}
        label="Add image by URL"
        value={pasted}
        maxlength={LIMITS.url}
        hint="Paste an https:// image address."
        error={pastedError}
        oninput={(v) => (pasted = v)}
      />
    </div>
    <AddButton label="Add" disabled={full || !safeImageSrc(pasted)} onclick={addPasted} />
  </div>

  {#if images.length === 0}
    <p class="text-xs text-muted-foreground">No images yet.</p>
  {/if}
  {#each images as image, index (index)}
    {@const preview = safeImageSrc(image.src)}
    <fieldset class="space-y-2 rounded-lg border border-border bg-surface p-3">
      <legend class="px-1 text-xs font-semibold text-muted-foreground">Image {index + 1}</legend>
      <div class="flex items-center gap-2">
        {#if preview}
          <img src={preview} alt="" class="h-16 w-16 shrink-0 rounded-lg border border-border bg-surface-alt object-cover" />
        {/if}
        <div class="ml-auto">
          <ItemToolbar
            noun="image"
            n={index + 1}
            count={images.length}
            onmove={(delta) => onchange(moveItem(images, index, index + delta))}
            onremove={() => onchange(removeItem(images, index))}
          />
        </div>
      </div>
      <TextField
        id={`${idBase}-src-${index}`}
        label={`Image ${index + 1} URL`}
        value={image.src}
        maxlength={LIMITS.url}
        error={image.src.trim() && !preview ? 'This image address is not allowed.' : ''}
        oninput={(v) => onchange(replaceItem(images, index, { ...image, src: v }))}
      />
      <TextField
        id={`${idBase}-alt-${index}`}
        label={`Image ${index + 1} alt text`}
        value={image.alt}
        maxlength={LIMITS.label}
        required
        error={!image.alt.trim() ? 'Describe the image.' : ''}
        oninput={(v) => onchange(replaceItem(images, index, { ...image, alt: v }))}
      />
      <TextField
        id={`${idBase}-caption-${index}`}
        label={`Image ${index + 1} caption (optional)`}
        value={image.caption}
        maxlength={LIMITS.label}
        oninput={(v) => onchange(replaceItem(images, index, { ...image, caption: v }))}
      />
    </fieldset>
  {/each}
</div>
