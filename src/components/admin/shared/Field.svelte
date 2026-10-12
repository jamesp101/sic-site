<script lang="ts">
  import type { Snippet } from 'svelte';

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
    children: Snippet;
  } = $props();
</script>

<div class={['space-y-1.5', className]}>
  <label for={id} class="block text-sm font-semibold text-foreground">
    {label}{#if required}<span class="text-destructive" aria-hidden="true"> *</span>{/if}
  </label>
  {@render children()}
  {#if hint}<p class="text-xs text-muted-foreground">{hint}</p>{/if}
  {#if error}<p id={`${id}-error`} class="text-xs text-destructive" role="alert">{error}</p>{/if}
</div>
