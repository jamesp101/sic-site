<script lang="ts">
  import Group from '../Group.svelte';
  import SelectField from '../SelectField.svelte';
  import { ALIGN_OPTIONS, BACKGROUND_OPTIONS, GAP_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'section'> = $props();
</script>

<Group title="Appearance">
  <SelectField id={fid('background')} label="Background" value={block.props.background} options={BACKGROUND_OPTIONS} onchange={(v) => set({ background: v })} />
  <SelectField id={fid('padding')} label="Padding" value={block.props.padding} options={GAP_OPTIONS} onchange={(v) => set({ padding: v })} />
  <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
</Group>
