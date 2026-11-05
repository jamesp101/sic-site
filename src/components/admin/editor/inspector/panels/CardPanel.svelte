<script lang="ts">
  import Group from '../Group.svelte';
  import ImageEditor from '../ImageEditor.svelte';
  import RichTextField from '../RichTextField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid, errors }: PanelProps<'card'> = $props();
</script>

<Group title="Content">
  <TextField id={fid('title')} label="Card title" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
  <RichTextField id={fid('body')} label="Card text" value={block.props.body} hint="A blank line starts a new paragraph." oninput={(v) => set({ body: v })} />
</Group>
<Group title="Image">
  <ImageEditor
    idBase={fid('image')}
    ownerKey={block.id}
    src={block.props.imageUrl}
    urlLabel="Card image URL"
    onupload={(image) => set({ imageUrl: image.url })}
    ontype={(url) => set({ imageUrl: url })}
  />
  <TextField id={fid('imageAlt')} label="Card image description" value={block.props.imageAlt} maxlength={LIMITS.label} hint="Leave empty if the image is only decorative." oninput={(v) => set({ imageAlt: v })} />
</Group>
<Group title="Link">
  <TextField id={fid('linkLabel')} label="Card link label" value={block.props.linkLabel} maxlength={LIMITS.label} error={errors.linkLabel} oninput={(v) => set({ linkLabel: v })} />
  <TextField id={fid('linkHref')} label="Card link URL" value={block.props.linkHref} maxlength={LIMITS.url} hint="Accepted: https://…, /path, mailto: or tel:" error={errors.linkHref} oninput={(v) => set({ linkHref: v })} />
</Group>
<p class="text-xs text-muted-foreground">Drop elements into the card in the canvas or Layers panel.</p>
