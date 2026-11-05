<script lang="ts">
  import Group from '../Group.svelte';
  import SelectField from '../SelectField.svelte';
  import { COLUMN_COUNT_OPTIONS, GAP_OPTIONS, RATIO_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'columns'> = $props();
</script>

<Group title="Layout">
  <SelectField id={fid('count')} label="Number of columns" value={block.props.count} options={COLUMN_COUNT_OPTIONS} onchange={(v) => set({ count: Number(v) })} />
  <SelectField id={fid('ratio')} label="Column widths" value={block.props.ratio} options={RATIO_OPTIONS} hint="Unequal widths apply to two columns only." onchange={(v) => set({ ratio: v })} />
  <SelectField id={fid('gap')} label="Gap" value={block.props.gap} options={GAP_OPTIONS} onchange={(v) => set({ gap: v })} />
</Group>
