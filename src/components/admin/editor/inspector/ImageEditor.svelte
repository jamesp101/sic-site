<script lang="ts">
  import { Upload } from '@lucide/svelte';
  import { uploadImage, type UploadedImage } from '../upload';
  import { safeImageSrc } from '../../../../lib/blocks/urls';
  import { LIMITS } from '../../../../lib/blocks/types';
  import { secondaryButtonClass } from '../../shared/form-utils';
  import TextField from './TextField.svelte';
  import { IMAGE_ACCEPT } from './options';

  let {
    idBase,
    ownerKey,
    src,
    urlLabel = 'Image URL',
    onupload,
    ontype,
  }: {
    idBase: string;
    /** Identifies the edited block; an upload finishing after the selection changed is discarded. */
    ownerKey: string;
    src: string;
    urlLabel?: string;
    onupload: (image: UploadedImage) => void;
    /** Called when the URL is typed or the image is removed (`''`). */
    ontype: (url: string) => void;
  } = $props();

  let uploading = $state(false);
  let error = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  const preview = $derived(src ? safeImageSrc(src) : null);

  async function onselect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const startedFor = ownerKey;
    uploading = true;
    error = '';
    try {
      const image = await uploadImage(file);
      if (startedFor === ownerKey) onupload(image);
    } catch (caught) {
      if (startedFor === ownerKey) error = caught instanceof Error ? caught.message : 'Upload failed. Please try again.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }
</script>

<div class="space-y-3">
  {#if preview}
    <img src={preview} alt="" class="max-h-32 w-auto max-w-full rounded-lg border border-border bg-surface-alt object-contain" />
  {/if}
  <div class="flex flex-wrap items-center gap-2">
    <input
      bind:this={fileInput}
      id={`${idBase}-file`}
      type="file"
      accept={IMAGE_ACCEPT}
      class="sr-only"
      tabindex="-1"
      aria-label="Choose image file"
      onchange={onselect}
    />
    <button
      type="button"
      class={[secondaryButtonClass, 'px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-60']}
      disabled={uploading}
      onclick={() => fileInput?.click()}
    >
      <Upload class="h-4 w-4" aria-hidden="true" />
      Upload image
    </button>
    {#if src}
      <button type="button" class={[secondaryButtonClass, 'px-3! py-1.5!']} onclick={() => ontype('')}>
        Remove image
      </button>
    {/if}
  </div>
  <p class="text-xs text-muted-foreground">PNG, JPG, WebP, GIF or AVIF.</p>
  {#if uploading}<p role="status" class="text-xs text-muted-foreground">Uploading…</p>{/if}
  {#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
  <TextField id={`${idBase}-url`} label={urlLabel} value={src} maxlength={LIMITS.url} oninput={ontype} />
</div>
