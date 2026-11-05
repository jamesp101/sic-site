<script lang="ts">
  import Group from '../Group.svelte';
  import RichTextField from '../RichTextField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'quote'> = $props();
</script>

<Group title="Content">
  <RichTextField id={fid('text')} label="Quote text" value={block.props.text} oninput={(v) => set({ text: v })} />
  <TextField id={fid('cite')} label="Attribution" value={block.props.cite} maxlength={LIMITS.label} oninput={(v) => set({ cite: v })} />
</Group>
