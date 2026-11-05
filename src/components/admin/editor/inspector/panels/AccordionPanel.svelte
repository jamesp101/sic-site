<script lang="ts">
  import AddButton from '../AddButton.svelte';
  import Group from '../Group.svelte';
  import ItemToolbar from '../ItemToolbar.svelte';
  import { moveItem, removeItem, replaceItem } from '../list-utils';
  import RichTextField from '../RichTextField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'accordion'> = $props();
</script>

<Group title="Items">
  {#each block.props.items as item, index (index)}
    {@const items = block.props.items}
    <fieldset class="space-y-2 rounded-lg border border-border bg-surface p-3">
      <legend class="px-1 text-xs font-semibold text-muted-foreground">Item {index + 1}</legend>
      <div class="flex items-end gap-1">
        <div class="min-w-0 flex-1">
          <TextField id={fid(`q-${index}`)} label={`Question ${index + 1}`} value={item.title} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, title: v }) })} />
        </div>
        <ItemToolbar noun="item" n={index + 1} count={items.length} onmove={(d) => set({ items: moveItem(items, index, index + d) })} onremove={() => set({ items: removeItem(items, index) })} />
      </div>
      <RichTextField id={fid(`a-${index}`)} label={`Answer ${index + 1}`} value={item.body} rows={3} oninput={(v) => set({ items: replaceItem(items, index, { ...item, body: v }) })} />
    </fieldset>
  {/each}
  <AddButton label="Add item" disabled={block.props.items.length >= LIMITS.accordionItems} onclick={() => set({ items: [...block.props.items, { title: '', body: '' }] })} />
</Group>
