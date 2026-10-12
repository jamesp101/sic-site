<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Label } from '@/components/ui/label';

  type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean };

  let {
    id,
    label,
    error = '',
    labelAside,
    children,
  }: { id: string; label: string; error?: string; labelAside?: Snippet; children: Snippet<[ControlProps]> } = $props();

  const errorId = $derived(`${id}-error`);
</script>

<div class="grid gap-2">
  <div class="flex items-center justify-between gap-2">
    <Label for={id}>{label}</Label>
    {@render labelAside?.()}
  </div>
  {@render children({ id, 'aria-describedby': error ? errorId : undefined, 'aria-invalid': error ? true : undefined })}
  {#if error}
    <p id={errorId} role="alert" class="text-sm text-destructive">{error}</p>
  {/if}
</div>
