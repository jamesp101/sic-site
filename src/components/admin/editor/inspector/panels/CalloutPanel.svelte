<script lang="ts">
  import Group from '../Group.svelte';
  import RichTextField from '../RichTextField.svelte';
  import SelectField from '../SelectField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import { CALLOUT_TONE_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'callout'> = $props();
</script>

<Group title="Content">
  <SelectField id={fid('tone')} label="Tone" value={block.props.tone} options={CALLOUT_TONE_OPTIONS} onchange={(v) => set({ tone: v })} />
  <TextField id={fid('title')} label="Callout title" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
  <RichTextField id={fid('text')} label="Callout text" value={block.props.text} oninput={(v) => set({ text: v })} />
</Group>
