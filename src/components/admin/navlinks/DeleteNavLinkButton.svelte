<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { id, label }: { id: number; label: string } = $props();
</script>

<DeleteTrigger
  label={`Delete ${label}`}
  title={`Delete ${label}?`}
  description="Any sub-links under this link are deleted with it."
  run={() => actions.navlinks.delete({ id })}
/>
