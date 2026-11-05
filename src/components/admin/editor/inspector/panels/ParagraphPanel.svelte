<script lang="ts">
  import Group from '../Group.svelte';
  import RichTextField from '../RichTextField.svelte';
  import SelectField from '../SelectField.svelte';
  import { ALIGN_OPTIONS, TEXT_SIZE_OPTIONS, TEXT_TONE_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'paragraph'> = $props();
</script>

<Group title="Content">
  <RichTextField id={fid('text')} label="Text" value={block.props.text} hint="A blank line starts a new paragraph." oninput={(v) => set({ text: v })} />
</Group>
<Group title="Appearance">
  <SelectField id={fid('size')} label="Text size" value={block.props.size} options={TEXT_SIZE_OPTIONS} onchange={(v) => set({ size: v })} />
  <SelectField id={fid('tone')} label="Text colour" value={block.props.tone} options={TEXT_TONE_OPTIONS} onchange={(v) => set({ tone: v })} />
  <SelectField id={fid('align')} label="Text alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
</Group>
