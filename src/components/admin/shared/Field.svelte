<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Attributes the control must spread (or set) so the label, hint and error are announced with it. */
  export type ControlProps = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };

  let {
    label,
    id,
    error = '',
    hint = '',
    required = false,
    class: className = '',
    children,
  }: {
    label: string;
    id: string;
    error?: string;
    hint?: string;
    required?: boolean;
    class?: string;
    children: Snippet<[ControlProps]>;
  } = $props();

  const hintId = $derived(`${id}-hint`);
  const errorId = $derived(`${id}-error`);
  const describedBy = $derived([hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class={['space-y-1.5', className]}>
  <label for={id} class="block text-sm font-semibold text-foreground">
    {label}{#if required}<span class="text-destructive" aria-hidden="true"> *</span>{/if}
  </label>
  {@render children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
  {#if hint}<p id={hintId} class="text-xs text-muted-foreground">{hint}</p>{/if}
  {#if error}<p id={errorId} class="text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
