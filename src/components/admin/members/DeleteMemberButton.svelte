<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { departmentId, id, name }: { departmentId: number; id: number; name: string } = $props();
</script>

<DeleteTrigger
  label={`Remove ${name}`}
  title={`Remove ${name}?`}
  description="Members who report to this person will become top-level members."
  run={() => actions.members.delete({ departmentId, id })}
/>
