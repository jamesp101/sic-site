<script lang="ts">
  import Group from '../Group.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import VideoUpload from '../VideoUpload.svelte';
  import type { PanelProps } from '../panel';

  let { block, set, fid, errors }: PanelProps<'video'> = $props();
</script>

<Group title="Video">
  <VideoUpload
    idBase={fid('video')}
    ownerKey={block.id}
    onupload={(url) => set({ url })}
  />
  <TextField
    id={fid('url')}
    label="Video URL"
    value={block.props.url}
    maxlength={LIMITS.url}
    hint="A YouTube or Vimeo link, or upload a video file above."
    error={block.props.url.trim() ? errors.url : ''}
    oninput={(v) => set({ url: v })}
  />
  <TextField
    id={fid('title')}
    label="Video title"
    value={block.props.title}
    maxlength={LIMITS.label}
    required
    hint="Read aloud by screen readers to describe the video."
    error={block.props.url.trim() ? errors.title : ''}
    oninput={(v) => set({ title: v })}
  />
  <TextField id={fid('caption')} label="Caption" value={block.props.caption} maxlength={LIMITS.label} oninput={(v) => set({ caption: v })} />
</Group>
