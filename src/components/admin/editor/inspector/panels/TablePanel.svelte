<script lang="ts">
  import CheckField from '../CheckField.svelte';
  import Group from '../Group.svelte';
  import TableEditor from '../TableEditor.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'table'> = $props();
</script>

<Group title="Table">
  <CheckField id={fid('header')} label="First row is a header" checked={block.props.header} onchange={(v) => set({ header: v })} />
  <TextField id={fid('caption')} label="Table caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
</Group>
<Group title="Cells">
  <TableEditor idBase={fid('cell')} rows={block.props.rows} onchange={(rows) => set({ rows })} />
</Group>
