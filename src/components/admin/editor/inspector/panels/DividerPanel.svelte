<script lang="ts">
  import Group from '../Group.svelte';
  import SelectField from '../SelectField.svelte';
  import { DIVIDER_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'divider'> = $props();
</script>

<Group title="Appearance">
  <SelectField id={fid('tone')} label="Style" value={block.props.tone} options={DIVIDER_OPTIONS} onchange={(v) => set({ tone: v })} />
</Group>
