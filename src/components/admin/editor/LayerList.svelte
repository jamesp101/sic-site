<script lang="ts">
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { isContainerType, BLOCK_META, type Block } from '@/lib/blocks/types';
  import { inlineToText } from '@/lib/blocks/inline';
  import { BLOCK_ICONS } from './block-icons';
  import LayerList from './LayerList.svelte';

  let {
    blocks,
    parentId = null,
    level = 0,
    revision = 0,
    selectedId,
    onselect,
    onmove,
    onhover,
  }: {
    blocks: Block[];
    parentId?: string | null;
    level?: number;
    /** Bumped by the parent to force the zone to re-sync from `blocks` (e.g. after a rejected drop). */
    revision?: number;
    selectedId: string | null;
    onselect: (id: string) => void;
    /** A block was dropped at `index` among the other children of `parentId`. */
    onmove: (id: string, parentId: string | null, index: number) => void;
    onhover: (id: string | null) => void;
  } = $props();

  // Local list owned by the dnd library while a drag is in progress.
  let list = $state.raw<Block[]>(untrack(() => blocks));
  $effect(() => {
    void revision;
    list = blocks;
  });

  const FLIP_MS = 120;

  function consider(event: CustomEvent<DndEvent<Block>>) {
    list = event.detail.items;
  }

  function finalize(event: CustomEvent<DndEvent<Block>>) {
    list = event.detail.items;
    const id = event.detail.info.id;
    const index = event.detail.items.findIndex((item) => item.id === id);
    // Only the zone that now contains the block reports the move (the source zone of a cross-zone move does not).
    if (index !== -1) onmove(id, parentId, index);
  }

  function preview(block: Block): string {
    // Props differ per block type; read the first non-empty label-like field.
    const raw: unknown = ['text', 'title', 'label', 'alt', 'source', 'caption']
      .map((key) => Reflect.get(block.props, key))
      .find((value) => typeof value === 'string' && value.trim() !== '');
    return typeof raw === 'string' ? inlineToText(raw).replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  }

  function keydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter' && event.target === event.currentTarget) {
      event.preventDefault();
      onselect(id);
    }
  }
</script>

<ul
  use:dndzone={{ items: list, flipDurationMs: FLIP_MS, type: 'layer', dropTargetStyle: {}, dropTargetClasses: ['bg-accent/60'] }}
  onconsider={consider}
  onfinalize={finalize}
  class={[
    'min-h-1.5',
    level > 0 && 'ml-3 border-l border-border pl-1 empty:min-h-6 empty:before:block empty:before:px-2 empty:before:py-1 empty:before:text-xs empty:before:text-muted-foreground empty:before:content-["Drop_here"]',
  ]}
  aria-label={level === 0 ? 'Elements in this document' : 'Nested elements'}
>
  {#each list as block (block.id)}
    {@const Icon = BLOCK_ICONS[block.type]}
    {@const selected = block.id === selectedId}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <li
      animate:flip={{ duration: FLIP_MS }}
      class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${BLOCK_META[block.type].label} ${preview(block)}${selected ? ', selected' : ''}`.trim()}
      onkeydown={(event) => keydown(event, block.id)}
      data-layer-id={block.id}
    >
      <button
        type="button"
        tabindex="-1"
        class={[
          'flex w-full cursor-grab items-center gap-1.5 rounded-md border-l-2 py-1 pr-2 pl-1.5 text-left text-xs transition-colors hover:bg-accent active:cursor-grabbing',
          selected ? 'border-ring bg-accent font-bold text-accent-foreground' : 'border-transparent text-foreground',
        ]}
        aria-current={selected ? 'true' : undefined}
        onclick={() => onselect(block.id)}
        onmouseenter={() => onhover(block.id)}
        onmouseleave={() => onhover(null)}
      >
        <Icon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="shrink-0">{BLOCK_META[block.type].label}</span>
        {#if preview(block)}<span class="truncate font-normal text-muted-foreground">{preview(block)}</span>{/if}
      </button>
      {#if isContainerType(block.type)}
        <LayerList
          blocks={block.children ?? []}
          parentId={block.id}
          level={level + 1}
          {revision}
          {selectedId}
          {onselect}
          {onmove}
          {onhover}
        />
      {/if}
    </li>
  {/each}
</ul>
