<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { id, name }: { id: number; name: string } = $props();
</script>

<DeleteTrigger
  label={`Delete slide ${name}`}
  title="Delete this slide?"
  description="The slide and its image will be permanently removed."
  run={() => actions.carousels.delete({ id })}
/>
