<script lang="ts">
  import { ExternalLink } from '@lucide/svelte';
  import { NAV_KIND_LABEL, classifyUrl } from '@/lib/nav-tree';

  let { url }: { url: string } = $props();

  const kind = $derived(classifyUrl(url));

  const tone = {
    page: 'bg-file-doc-bg text-file-doc-fg',
    department: 'bg-file-sheet-bg text-file-sheet-fg',
    post: 'bg-file-image-bg text-file-image-fg',
    'departments-menu': 'bg-status-event-bg text-status-event-fg',
    anchor: 'bg-file-other-bg text-file-other-fg',
    external: 'bg-file-other-bg text-file-other-fg',
    email: 'bg-file-other-bg text-file-other-fg',
    phone: 'bg-file-other-bg text-file-other-fg',
  } as const;
</script>

{#if kind}
  <span
    data-testid="nav-kind"
    class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold {tone[kind]}"
  >
    {NAV_KIND_LABEL[kind]}
    {#if kind === 'external'}<ExternalLink class="h-3 w-3" aria-hidden="true" />{/if}
  </span>
{/if}
