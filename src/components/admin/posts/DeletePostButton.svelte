<script lang="ts">
  import { actions } from 'astro:actions';
  import DeleteTrigger from '../shared/DeleteTrigger.svelte';

  let { id, name }: { id: number; name: string } = $props();
</script>

<DeleteTrigger
  label={`Delete post ${name}`}
  title="Delete this post?"
  description="The post and its highlight image will be permanently removed. This cannot be undone."
  run={() => actions.posts.delete({ id })}
/>
