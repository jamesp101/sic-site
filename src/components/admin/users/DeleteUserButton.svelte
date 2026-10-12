<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { id, name }: { id: number; name: string } = $props();
</script>

<DeleteTrigger
  label={`Delete ${name}`}
  title={`Delete ${name}?`}
  description="The account, its sessions and content authored by this user will be permanently removed."
  run={() => actions.users.delete({ id })}
/>
