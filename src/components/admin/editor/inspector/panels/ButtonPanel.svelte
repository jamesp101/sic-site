<script lang="ts">
  import Group from '../Group.svelte';
  import SelectField from '../SelectField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import { ALIGN_OPTIONS, BUTTON_VARIANT_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid, errors }: PanelProps<'button'> = $props();
</script>

<Group title="Content">
  <TextField id={fid('label')} label="Button label" value={block.props.label} maxlength={LIMITS.label} error={errors.label} oninput={(v) => set({ label: v })} />
  <TextField
    id={fid('href')}
    label="Button link"
    value={block.props.href}
    maxlength={LIMITS.url}
    hint="Accepted: https://…, /path, mailto: or tel:"
    error={errors.href}
    oninput={(v) => set({ href: v })}
  />
</Group>
<Group title="Appearance">
  <SelectField id={fid('variant')} label="Button style" value={block.props.variant} options={BUTTON_VARIANT_OPTIONS} onchange={(v) => set({ variant: v })} />
  <SelectField id={fid('align')} label="Alignment" value={block.props.align} options={ALIGN_OPTIONS} onchange={(v) => set({ align: v })} />
</Group>
