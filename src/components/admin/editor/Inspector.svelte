<script lang="ts">
  import { BLOCK_REGISTRY } from '@/lib/blocks/registry';
  import { blockFieldErrors } from '@/lib/blocks/schema';
  import type { Block } from '@/lib/blocks/types';
  import { inspectorPanel } from './block-editors';

  let {
    block,
    onupdate,
    idPrefix,
    onconvert,
  }: {
    block: Block | null;
    onupdate: (id: string, patch: Record<string, unknown>) => void;
    idPrefix?: string;
    /** Shown only for markdown blocks: converts the legacy source into blocks. */
    onconvert?: (id: string) => void;
  } = $props();

  function set(patch: Record<string, unknown>) {
    if (block) onupdate(block.id, patch);
  }

  /** Unique control id for the selected block. */
  function fid(field: string): string {
    return `${idPrefix ?? 'insp'}-${block?.id ?? 'none'}-${field}`;
  }
</script>

<div class="space-y-4 text-sm">
  {#if !block}
    <p class="text-sm text-muted-foreground">Select an element on the canvas or in Layers to edit its properties.</p>
  {:else}
    {@const Panel = inspectorPanel(block.type)}
    <h3 class="text-sm font-bold text-foreground">{BLOCK_REGISTRY[block.type].meta.label} properties</h3>
    <Panel {block} {set} {fid} errors={blockFieldErrors(block.type, block.props)} {onconvert} />
  {/if}
</div>
