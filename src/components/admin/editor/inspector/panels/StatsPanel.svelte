<script lang="ts">
  import AddButton from '../AddButton.svelte';
  import Group from '../Group.svelte';
  import ItemToolbar from '../ItemToolbar.svelte';
  import { moveItem, removeItem, replaceItem } from '../list-utils';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'stats'> = $props();
</script>

<Group title="Stats">
  {#each block.props.items as item, index (index)}
    {@const items = block.props.items}
    <fieldset class="space-y-2 rounded-lg border border-border bg-surface p-3">
      <legend class="px-1 text-xs font-semibold text-muted-foreground">Stat {index + 1}</legend>
      <div class="flex justify-end">
        <ItemToolbar noun="stat" n={index + 1} count={items.length} onmove={(d) => set({ items: moveItem(items, index, index + d) })} onremove={() => set({ items: removeItem(items, index) })} />
      </div>
      <TextField id={fid(`value-${index}`)} label={`Value ${index + 1}`} value={item.value} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, value: v }) })} />
      <TextField id={fid(`label-${index}`)} label={`Label ${index + 1}`} value={item.label} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, label: v }) })} />
      <TextField id={fid(`hint-${index}`)} label={`Note ${index + 1} (optional)`} value={item.hint} maxlength={LIMITS.label} oninput={(v) => set({ items: replaceItem(items, index, { ...item, hint: v }) })} />
    </fieldset>
  {/each}
  <AddButton label="Add stat" disabled={block.props.items.length >= LIMITS.statItems} onclick={() => set({ items: [...block.props.items, { value: '', label: '', hint: '' }] })} />
</Group>
