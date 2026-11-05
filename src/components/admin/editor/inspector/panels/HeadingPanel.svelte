<script lang="ts">
  import Group from '../Group.svelte';
  import SelectField from '../SelectField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import { ALIGN_OPTIONS, HEADING_LEVEL_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'heading'> = $props();
</script>

<Group title="Content">
  <TextField id={fid('text')} label="Heading text" value={block.props.text} maxlength={LIMITS.label} oninput={(v) => set({ text: v })} />
</Group>
<Group title="Appearance">
  <SelectField id={fid('level')} label="Heading level" value={block.props.level} options={HEADING_LEVEL_OPTIONS} onchange={(v) => set({ level: Number(v) })} />
  <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
</Group>
