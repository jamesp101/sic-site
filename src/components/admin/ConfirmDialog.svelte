<script lang="ts">
  import { tick } from 'svelte';
  import { Loader2 } from '@lucide/svelte';
  import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
  import { primaryButtonClass, secondaryButtonClass } from './shared/form-utils';

  let {
    open = $bindable(false),
    title,
    description = '',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    processing = false,
    onConfirm,
  }: {
    open?: boolean;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    processing?: boolean;
    onConfirm: () => void | Promise<void>;
  } = $props();

  let cancelButton = $state<HTMLButtonElement | null>(null);

  // Move focus into the dialog so keyboard users can act on it immediately.
  $effect(() => {
    if (open) tick().then(() => cancelButton?.focus());
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open && !processing) open = false;
  }
</script>

<svelte:window onkeydown={onKeydown} />

<Dialog bind:open>
  <DialogContent class="max-w-md border-border bg-surface shadow-brand-xl">
    <div class="space-y-2">
      <DialogTitle>{title}</DialogTitle>
      {#if description}
        <DialogDescription>{description}</DialogDescription>
      {/if}
    </div>
    <div class="mt-6">
      <DialogFooter>
        <button type="button" bind:this={cancelButton} onclick={() => (open = false)} disabled={processing} class={secondaryButtonClass}>
          {cancelLabel}
        </button>
        <button
          type="button"
          onclick={onConfirm}
          disabled={processing}
          class={destructive
            ? 'inline-flex items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground shadow-brand-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
            : primaryButtonClass}
        >
          {#if processing}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{/if}
          {confirmLabel}
        </button>
      </DialogFooter>
    </div>
  </DialogContent>
</Dialog>
