<script lang="ts">
  import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';

  let {
    noun,
    n,
    count,
    onmove,
    onremove,
  }: {
    /** Lower-case singular noun used in the button names, e.g. `item`, `stat`, `badge`. */
    noun: string;
    /** 1-based position. */
    n: number;
    count: number;
    onmove: (delta: -1 | 1) => void;
    onremove: () => void;
  } = $props();

  const buttonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';
</script>

<div class="flex shrink-0 items-center gap-0.5">
  <button
    type="button"
    class={buttonClass}
    aria-label={`Move ${noun} ${n} up`}
    disabled={n === 1}
    onclick={() => onmove(-1)}
  >
    <ArrowUp class="h-4 w-4" aria-hidden="true" />
  </button>
  <button
    type="button"
    class={buttonClass}
    aria-label={`Move ${noun} ${n} down`}
    disabled={n === count}
    onclick={() => onmove(1)}
  >
    <ArrowDown class="h-4 w-4" aria-hidden="true" />
  </button>
  <button
    type="button"
    class={`${buttonClass} hover:bg-destructive/10! hover:text-destructive!`}
    aria-label={`Remove ${noun} ${n}`}
    onclick={onremove}
  >
    <Trash2 class="h-4 w-4" aria-hidden="true" />
  </button>
</div>
