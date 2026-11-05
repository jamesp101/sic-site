<script lang="ts">
  import CheckField from '../CheckField.svelte';
  import Group from '../Group.svelte';
  import ImageEditor from '../ImageEditor.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid, errors }: PanelProps<'image'> = $props();
</script>

<Group title="Image">
  <ImageEditor
    idBase={fid('image')}
    ownerKey={block.id}
    src={block.props.src}
    onupload={(image) => set({ src: image.url, width: image.width, height: image.height })}
    ontype={(url) => set({ src: url, width: null, height: null })}
  />
</Group>
<Group title="Accessibility">
  <CheckField id={fid('decorative')} label="Decorative image (no alt text)" checked={block.props.decorative} onchange={(v) => set({ decorative: v })} />
  <TextField
    id={fid('alt')}
    label="Alt text"
    value={block.props.alt}
    maxlength={LIMITS.label}
    required={!block.props.decorative}
    disabled={block.props.decorative}
    error={errors.alt}
    oninput={(v) => set({ alt: v })}
  />
</Group>
<Group title="Caption">
  <TextField id={fid('caption')} label="Caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
</Group>
<Group title="Link">
  <TextField
    id={fid('link')}
    label="Link (optional)"
    value={block.props.link ?? ''}
    maxlength={LIMITS.url}
    hint="Makes the image clickable. Accepted: https://…, /path, mailto: or tel:. External links open in a new tab."
    error={errors.link}
    oninput={(v) => set({ link: v })}
  />
</Group>
