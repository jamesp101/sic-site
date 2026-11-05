<script lang="ts">
  import Group from '../Group.svelte';
  import { joinDateTime, splitDateTime } from '../list-utils';
  import RichTextField from '../RichTextField.svelte';
  import TextField from '../TextField.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid, errors }: PanelProps<'event'> = $props();

  const start = $derived(splitDateTime(block.props.start));
  const end = $derived(splitDateTime(block.props.end));
</script>

<Group title="Event">
  <TextField id={fid('title')} label="Event title (optional)" value={block.props.title} maxlength={LIMITS.label} oninput={(v) => set({ title: v })} />
</Group>
<Group title="Start">
  <TextField id={fid('start-date')} type="date" label="Start date" value={start.date} error={errors.start} oninput={(v) => set({ start: joinDateTime(v, start.time) })} />
  <TextField id={fid('start-time')} type="time" label="Start time (optional)" value={start.time} oninput={(v) => set({ start: joinDateTime(start.date, v) })} hint={start.date ? '' : 'Choose a start date first; a time alone is not saved.'} />
</Group>
<Group title="End">
  <TextField id={fid('end-date')} type="date" label="End date (optional)" value={end.date} error={errors.end} oninput={(v) => set({ end: joinDateTime(v, end.time) })} />
  <TextField id={fid('end-time')} type="time" label="End time (optional)" value={end.time} oninput={(v) => set({ end: joinDateTime(end.date, v) })} hint={end.date ? '' : 'Choose an end date first; a time alone is not saved.'} />
</Group>
<Group title="Details">
  <TextField id={fid('location')} label="Location" value={block.props.location} maxlength={LIMITS.label} oninput={(v) => set({ location: v })} />
  <RichTextField id={fid('note')} label="Details" value={block.props.note} oninput={(v) => set({ note: v })} />
</Group>
