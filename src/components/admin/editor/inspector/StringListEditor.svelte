<script lang="ts">
  import { inputClass } from '../../shared/form-utils';
  import AddButton from './AddButton.svelte';
  import ItemToolbar from './ItemToolbar.svelte';
  import { moveItem, removeItem, replaceItem } from './list-utils';

  let {
    idBase,
    legend,
    noun,
    items,
    max,
    onchange,
    maxlength = 300,
  }: {
    idBase: string;
    legend: string;
    /** Lower-case singular noun: `item`, `badge`. */
    noun: string;
    items: string[];
    max: number;
    onchange: (items: string[]) => void;
    maxlength?: number;
  } = $props();

  const title = $derived(noun.charAt(0).toUpperCase() + noun.slice(1));
</script>

<fieldset class="space-y-2">
  <legend class="text-sm font-semibold text-foreground">{legend}</legend>
  {#if items.length === 0}
    <p class="text-xs text-muted-foreground">No {noun}s yet.</p>
  {/if}
  <ul class="space-y-2">
    {#each items as item, index (index)}
      <li class="flex items-center gap-1">
        <input
          id={`${idBase}-${index}`}
          type="text"
          value={item}
          {maxlength}
          class={inputClass}
          aria-label={`${title} ${index + 1}`}
          oninput={(event) => onchange(replaceItem(items, index, event.currentTarget.value))}
        />
        <ItemToolbar
          {noun}
          n={index + 1}
          count={items.length}
          onmove={(delta) => onchange(moveItem(items, index, index + delta))}
          onremove={() => onchange(removeItem(items, index))}
        />
      </li>
    {/each}
  </ul>
  <AddButton label={`Add ${noun}`} disabled={items.length >= max} onclick={() => onchange([...items, ''])} />
  {#if items.length >= max}<p class="text-xs text-muted-foreground">Maximum of {max} {noun}s reached.</p>{/if}
</fieldset>
