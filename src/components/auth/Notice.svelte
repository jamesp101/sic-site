<script lang="ts">
  let { kind, message }: { kind: 'error' | 'success'; message: string } = $props();
</script>

{#if message}
  <p
    role={kind === 'error' ? 'alert' : 'status'}
    class="rounded-md border px-3 py-2 text-sm {kind === 'error'
      ? 'border-destructive/30 bg-destructive/10 text-destructive'
      : 'border-border-strong bg-status-article-bg text-status-article-fg'}"
  >
    {message}
  </p>
{/if}
