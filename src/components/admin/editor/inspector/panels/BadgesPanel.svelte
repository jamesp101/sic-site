<script lang="ts">
  import Group from '../Group.svelte';
  import StringListEditor from '../StringListEditor.svelte';
  import { LIMITS } from '@/lib/blocks/types';
  import type { PanelProps } from '../panel';

  let { block, set, fid }: PanelProps<'badges'> = $props();
</script>

<Group title="Content">
  <StringListEditor idBase={fid('badge')} legend="Badges" noun="badge" items={block.props.items} max={LIMITS.badgeItems} maxlength={LIMITS.label} onchange={(items) => set({ items })} />
</Group>
