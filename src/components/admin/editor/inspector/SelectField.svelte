<script lang="ts">
  import Field from '../../shared/Field.svelte';
  import { selectClass } from '../../ui';
  import type { Option } from './options';

  let {
    id,
    label,
    value,
    options,
    onchange,
    hint = '',
  }: {
    id: string;
    label: string;
    value: string | number;
    options: Option[];
    /** Receives the raw option value as a string; callers convert numeric options. */
    onchange: (value: string) => void;
    hint?: string;
  } = $props();
</script>

<Field {label} {id} {hint}>
  <select {id} class={[selectClass, 'w-full']} {value} onchange={(event) => onchange(event.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</Field>
