<script lang="ts">
  import CheckField from '../CheckField.svelte';
  import Group from '../Group.svelte';
  import StringListEditor from '../StringListEditor.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'list'> = $props();
</script>

<Group title="Content">
  <CheckField id={fid('ordered')} label="Numbered list" checked={block.props.ordered} onchange={(v) => set({ ordered: v })} />
  <StringListEditor idBase={fid('item')} legend="Items" noun="item" items={block.props.items} max={LIMITS.listItems} onchange={(items) => set({ items })} />
</Group>
