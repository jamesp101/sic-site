<script lang="ts">
  import { Crop, FileImage, Trash2, Upload, ZoomIn } from '@lucide/svelte';
  import ImageCropperModal from '@/components/ImageCropperModal.svelte';
  import ImageViewerModal from '@/components/ImageViewerModal.svelte';
  import { formatFileSize, secondaryButtonClass } from './form-utils';

  let {
    file = $bindable(null),
    id,
    label,
    existingUrl = null,
    aspectRatio,
    cropTitle = 'Crop Image',
    hint = 'PNG, JPG, WebP or GIF',
    required = false,
    error = '',
    fit = 'contain',
  }: {
    file: File | null;
    id: string;
    label: string;
    /** Public URL of the image currently stored, shown until a new file is chosen. */
    existingUrl?: string | null;
    aspectRatio?: number;
    cropTitle?: string;
    hint?: string;
    required?: boolean;
    error?: string;
    fit?: 'contain' | 'cover';
  } = $props();

  let cropperSrc = $state<string | null>(null);
  let cropperOpen = $state(false);
  let previewUrl = $state<string | null>(null);
  let viewerOpen = $state(false);
  let input = $state<HTMLInputElement | null>(null);

  const shownUrl = $derived(previewUrl ?? existingUrl);
  const fitClass = $derived(fit === 'cover' ? 'object-cover' : 'object-contain p-1');

  function onSelect(event: Event) {
    const chosen = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!chosen) return;
    cropperSrc = URL.createObjectURL(chosen);
    cropperOpen = true;
  }

  function onCrop(cropped: File, url: string) {
    file = cropped;
    previewUrl = url;
    cropperOpen = false;
  }

  function onCancel() {
    cropperOpen = false;
    if (input) input.value = '';
  }

  function clear() {
    file = null;
    previewUrl = null;
    cropperSrc = null;
    if (input) input.value = '';
  }
</script>

<ImageCropperModal isOpen={cropperOpen} imageSrc={cropperSrc} {aspectRatio} title={cropTitle} {onCrop} {onCancel} />
<ImageViewerModal isOpen={viewerOpen} imageSrc={shownUrl} title={label} onClose={() => (viewerOpen = false)} />

<div class="space-y-2">
  <span class="block text-sm font-semibold text-foreground">
    {label}{#if required}<span class="text-destructive" aria-hidden="true"> *</span>{/if}
  </span>

  {#if shownUrl}
    <div class="flex flex-col items-start justify-between gap-4 rounded-lg border border-border-strong bg-surface-alt p-4 sm:flex-row sm:items-center">
      <div class="flex items-center gap-4">
        <button
          type="button"
          onclick={() => (viewerOpen = true)}
          class="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border-strong bg-surface"
          aria-label="View full size"
        >
          <img src={shownUrl} alt="" class={['h-full w-full', fitClass]} />
          <span class="absolute inset-0 flex items-center justify-center bg-brand-950/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
            <ZoomIn class="h-4 w-4" aria-hidden="true" />
          </span>
        </button>
        <div class="space-y-1 text-sm">
          {#if file}
            <p class="flex items-center gap-2 font-semibold text-foreground">
              <FileImage class="h-4 w-4 text-link" aria-hidden="true" />
              <span class="max-w-[240px] truncate">{file.name}</span>
            </p>
            <p class="text-xs text-muted-foreground">{formatFileSize(file.size)} · ready to upload</p>
          {:else}
            <p class="text-xs text-muted-foreground">Current image</p>
          {/if}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <label for={id} class={[secondaryButtonClass, 'cursor-pointer !px-3 !py-1.5 text-xs']}>
          <Crop class="h-3.5 w-3.5" aria-hidden="true" /> {file ? 'Replace' : 'Change'}
        </label>
        {#if file}
          <button type="button" onclick={clear} class={[secondaryButtonClass, '!px-3 !py-1.5 text-xs text-destructive']}>
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" /> Remove
          </button>
        {/if}
      </div>
    </div>
  {:else}
    <label
      for={id}
      class="flex h-36 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong text-center transition-colors hover:bg-surface-alt"
    >
      <Upload class="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <span class="text-sm text-foreground"><span class="font-semibold text-link">Click to upload</span> or drag and drop</span>
      <span class="text-xs text-muted-foreground">{hint}</span>
    </label>
  {/if}

  <input bind:this={input} {id} type="file" accept="image/*" class="sr-only" onchange={onSelect} aria-invalid={error ? 'true' : undefined} />
  {#if error}<p class="text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
