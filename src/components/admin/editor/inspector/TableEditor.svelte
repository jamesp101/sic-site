<script lang="ts">
  import { Trash2 } from '@lucide/svelte';
  import { inputClass } from '../../shared/form-utils';
  import { LIMITS } from '../../../../lib/blocks/types';
  import AddButton from './AddButton.svelte';
  import { removeItem } from './list-utils';

  let { idBase, rows, onchange }: { idBase: string; rows: string[][]; onchange: (rows: string[][]) => void } =
    $props();

  const columnCount = $derived(Math.max(1, ...rows.map((row) => row.length)));
  const columns = $derived(Array.from({ length: columnCount }, (_, c) => c));

  /** Pads every row to the same width so the table stays rectangular. */
  function normalised(): string[][] {
    return rows.map((row) => Array.from({ length: columnCount }, (_, c) => row[c] ?? ''));
  }

  function setCell(r: number, c: number, value: string) {
    onchange(normalised().map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)));
  }

  const removeClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40';
</script>

<div class="space-y-2">
  <div class="overflow-x-auto">
    <table class="border-separate border-spacing-1">
      <caption class="sr-only">Table cells</caption>
      <thead>
        <tr>
          {#each columns as c (c)}
            <th scope="col" class="text-center font-normal">
              <button
                type="button"
                class={removeClass}
                aria-label={`Remove column ${c + 1}`}
                disabled={columnCount <= 1}
                onclick={() => onchange(normalised().map((row) => removeItem(row, c)))}
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </th>
          {/each}
          <th scope="col"><span class="sr-only">Row actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as _row, r (r)}
          <tr>
            {#each columns as c (c)}
              <td>
                <input
                  id={`${idBase}-${r}-${c}`}
                  type="text"
                  value={rows[r]?.[c] ?? ''}
                  maxlength={LIMITS.cell}
                  class={[inputClass, 'min-w-28']}
                  aria-label={`Row ${r + 1}, column ${c + 1}`}
                  oninput={(event) => setCell(r, c, event.currentTarget.value)}
                />
              </td>
            {/each}
            <td>
              <button
                type="button"
                class={removeClass}
                aria-label={`Remove row ${r + 1}`}
                disabled={rows.length <= 1}
                onclick={() => onchange(removeItem(normalised(), r))}
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="flex flex-wrap gap-2">
    <AddButton
      label="Add row"
      disabled={rows.length >= LIMITS.tableRows}
      onclick={() => onchange([...normalised(), Array.from({ length: columnCount }, () => '')])}
    />
    <AddButton
      label="Add column"
      disabled={columnCount >= LIMITS.tableColumns}
      onclick={() => onchange(normalised().map((row) => [...row, '']))}
    />
  </div>
</div>
