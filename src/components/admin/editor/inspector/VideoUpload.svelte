<script lang="ts">
  import { Upload } from '@lucide/svelte';
  import { secondaryButtonClass } from '../../shared/form-utils';
  import { uploadVideo } from '../upload';
  import { VIDEO_ACCEPT } from './options';

  let {
    idBase,
    ownerKey,
    onupload,
  }: {
    idBase: string;
    /** Identifies the edited block; an upload finishing after the selection changed is discarded. */
    ownerKey: string;
    onupload: (url: string) => void;
  } = $props();

  let progress = $state<number | null>(null);
  let error = $state('');
  let fileInput = $state<HTMLInputElement | null>(null);

  async function onselect(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const startedFor = ownerKey;
    error = '';
    progress = 0;
    try {
      const { url } = await uploadVideo(file, (fraction) => {
        if (startedFor === ownerKey) progress = fraction;
      });
      if (startedFor === ownerKey) onupload(url);
    } catch (caught) {
      if (startedFor === ownerKey) error = caught instanceof Error ? caught.message : 'Upload failed. Please try again.';
    } finally {
      progress = null;
    }
  }

  const percent = $derived(progress === null ? 0 : Math.round(progress * 100));
</script>

<div class="space-y-2">
  <input
    bind:this={fileInput}
    id={`${idBase}-file`}
    type="file"
    accept={VIDEO_ACCEPT}
    class="sr-only"
    tabindex="-1"
    aria-label="Choose video file"
    onchange={onselect}
  />
  <button
    type="button"
    class={[secondaryButtonClass, 'px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-60']}
    disabled={progress !== null}
    onclick={() => fileInput?.click()}
  >
    <Upload class="h-4 w-4" aria-hidden="true" />
    Upload video
  </button>
  <p class="text-xs text-muted-foreground">MP4 or WebM, up to 100 MB.</p>
  {#if progress !== null}
    <div class="space-y-1" role="status">
      <progress class="h-2 w-full" max="100" value={percent} aria-label="Video upload progress"></progress>
      <p class="text-xs text-muted-foreground">Uploading… {percent}%</p>
    </div>
  {/if}
  {#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
</div>
