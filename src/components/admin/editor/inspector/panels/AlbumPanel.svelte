<script lang="ts">
  import Group from '../Group.svelte';
  import AlbumEditor from '../AlbumEditor.svelte';
  import SelectField from '../SelectField.svelte';
  import { ALBUM_COLUMN_OPTIONS } from '../options';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'album'> = $props();
</script>

<Group title="Images">
  <AlbumEditor
    idBase={fid('album')}
    ownerKey={block.id}
    images={block.props.images}
    onchange={(images) => set({ images })}
  />
</Group>
<Group title="Layout">
  <SelectField id={fid('columns')} label="Columns" value={block.props.columns} options={ALBUM_COLUMN_OPTIONS} hint="Columns on wide screens; small screens always show two." onchange={(v) => set({ columns: Number(v) })} />
</Group>
