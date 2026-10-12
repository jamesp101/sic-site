<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { id, name }: { id: number; name: string } = $props();
</script>

<DeleteTrigger
  label={`Delete ${name}`}
  title={`Delete ${name}?`}
  description="The department, its members, carousel slides and uploaded images will be permanently removed."
  run={() => actions.departments.delete({ id })}
/>
