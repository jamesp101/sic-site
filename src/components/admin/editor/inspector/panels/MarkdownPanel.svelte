<script lang="ts">
  import Field from '../../../shared/Field.svelte';
  import Group from '../Group.svelte';
  import { inputClass, secondaryButtonClass } from '../../../shared/form-utils';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid, onconvert }: PanelProps<'markdown'> = $props();
</script>

<Group title="Source">
  <Field label="Markdown source" id={fid('source')}>
    {#snippet children(props)}
      <textarea
        {...props}
        rows={14}
        maxlength={LIMITS.markdown}
        value={block.props.source}
        class={[inputClass, 'resize-y font-mono']}
        oninput={(event) => set({ source: event.currentTarget.value })}
      ></textarea>
    {/snippet}
  </Field>
</Group>
<div class="space-y-2 rounded-lg border-2 border-gold-500 bg-surface-alt p-3" role="group" aria-labelledby={fid('legacy')}>
  <h4 id={fid('legacy')} class="text-sm font-bold text-foreground">Legacy content</h4>
  <p class="text-xs text-muted-foreground">
    This content was written in Markdown before the visual editor. It still displays correctly. Convert it to blocks to edit it visually; you can undo the conversion.
  </p>
  {#if onconvert}
    <button type="button" class={[secondaryButtonClass, 'px-3! py-1.5!']} onclick={() => onconvert(block.id)}>
      Convert to blocks
    </button>
  {/if}
</div>
