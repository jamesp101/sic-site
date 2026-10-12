<script lang="ts">
  import { Loader2, Save } from '@lucide/svelte';
  import { primaryButtonClass, secondaryButtonClass } from './form-utils';

  let {
    cancelHref,
    processing = false,
    submitLabel = 'Save',
    message = '',
  }: {
    cancelHref: string;
    processing?: boolean;
    submitLabel?: string;
    message?: string;
  } = $props();
</script>

{#if message}
  <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{message}</p>
{/if}
<div class="flex items-center justify-end gap-3 border-t border-border pt-4">
  <a href={cancelHref} class={secondaryButtonClass}>Cancel</a>
  <button type="submit" disabled={processing} class={primaryButtonClass}>
    {#if processing}
      <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" /> Saving…
    {:else}
      <Save class="h-4 w-4" aria-hidden="true" /> {submitLabel}
    {/if}
  </button>
</div>
