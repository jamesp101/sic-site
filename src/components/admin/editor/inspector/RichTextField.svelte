<script lang="ts">
  import { Bold, Italic, Link } from '@lucide/svelte';
  import { tick } from 'svelte';
  import Field from '../../shared/Field.svelte';
  import { inputClass } from '../../shared/form-utils';
  import { LIMITS } from '../../../../lib/blocks/types';

  let {
    id,
    label,
    value,
    oninput,
    rows = 4,
    hint = '',
    maxlength = LIMITS.text,
  }: {
    id: string;
    label: string;
    value: string;
    oninput: (value: string) => void;
    rows?: number;
    /** Extra hint shown before the inline-markup hint (e.g. paragraph behaviour). */
    hint?: string;
    maxlength?: number;
  } = $props();

  let area = $state<HTMLTextAreaElement | null>(null);

  const buttonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none';

  async function wrap(before: string, after: string, fallback: string, selectInner: 'text' | 'url') {
    if (!area) return;
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = value.slice(start, end) || fallback;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    let from: number;
    let to: number;
    if (selectInner === 'url') {
      from = start + before.length + selected.length + 2;
      to = from + 'https://'.length;
    } else {
      from = start + before.length;
      to = from + selected.length;
    }
    oninput(next);
    await tick();
    area?.focus();
    area?.setSelectionRange(from, to);
  }
</script>

<Field {label} {id}>
  <div class="flex items-center gap-1" role="toolbar" aria-label={`${label} formatting`} aria-controls={id}>
    <button type="button" class={buttonClass} aria-label="Bold" title="Bold" onclick={() => wrap('**', '**', 'text', 'text')}>
      <Bold class="h-4 w-4" aria-hidden="true" />
    </button>
    <button type="button" class={buttonClass} aria-label="Italic" title="Italic" onclick={() => wrap('*', '*', 'text', 'text')}>
      <Italic class="h-4 w-4" aria-hidden="true" />
    </button>
    <button
      type="button"
      class={buttonClass}
      aria-label="Link"
      title="Link"
      onclick={() => wrap('[', '](https://)', 'text', 'url')}
    >
      <Link class="h-4 w-4" aria-hidden="true" />
    </button>
  </div>
  <textarea
    {id}
    {rows}
    {maxlength}
    {value}
    bind:this={area}
    class={[inputClass, 'resize-y']}
    aria-describedby={`${id}-hint`}
    oninput={(event) => oninput(event.currentTarget.value)}
  ></textarea>
  <p id={`${id}-hint`} class="text-xs text-muted-foreground">
    {#if hint}{hint}
    {/if}Use **bold**, *italic* and [label](https://…) for links.
  </p>
</Field>
