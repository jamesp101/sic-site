<script lang="ts">
  import { BLOCK_GROUPS, BLOCK_META, BLOCK_TYPES, type BlockType } from '@/lib/blocks/types';
  import { BLOCK_ICONS } from './block-icons';

  let {
    onadd,
    onbegindrag,
  }: {
    /** Click / Enter / Space: insert at the default position. */
    onadd: (type: BlockType) => void;
    /** Pointer drag started from a palette item (client coordinates). */
    onbegindrag: (type: BlockType, x: number, y: number) => void;
  } = $props();

  const groups = BLOCK_GROUPS.map((group) => ({
    group,
    types: BLOCK_TYPES.filter((type) => BLOCK_META[type].group === group),
  })).filter((entry) => entry.types.length > 0);

  let suppressClick = false;

  function pointerdown(event: PointerEvent, type: BlockType) {
    suppressClick = false;
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      cleanup();
      suppressClick = true;
      onbegindrag(type, e.clientX, e.clientY);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cleanup);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cleanup);
  }

  function click(type: BlockType) {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    onadd(type);
  }
</script>

<div class="space-y-4" data-editor-palette>
  <p class="px-1 text-xs text-muted-foreground">Click an element to add it, or drag it onto the canvas.</p>
  {#each groups as { group, types } (group)}
    <section aria-labelledby={`palette-${group}`}>
      <h4 id={`palette-${group}`} class="mb-1.5 px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group}</h4>
      <ul class="grid grid-cols-2 gap-1.5">
        {#each types as type (type)}
          {@const Icon = BLOCK_ICONS[type]}
          <li>
            <button
              type="button"
              class="flex w-full cursor-grab items-center gap-2 rounded-lg border border-border bg-surface px-2 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:border-border-strong hover:bg-accent active:cursor-grabbing"
              aria-label={`Add ${BLOCK_META[type].label}`}
              title={BLOCK_META[type].description}
              onpointerdown={(event) => pointerdown(event, type)}
              onclick={() => click(type)}
            >
              <Icon class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span class="truncate">{BLOCK_META[type].label}</span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>
