<script lang="ts">
  import Field from '../../shared/Field.svelte';
  import { inputClass } from '../../shared/form-utils';

  let {
    id,
    label,
    value,
    oninput,
    type = 'text',
    hint = '',
    error = '',
    required = false,
    disabled = false,
    maxlength,
    placeholder,
  }: {
    id: string;
    label: string;
    value: string;
    oninput: (value: string) => void;
    type?: 'text' | 'date' | 'time' | 'url';
    hint?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;
    maxlength?: number;
    placeholder?: string;
  } = $props();
</script>

<Field {label} {id} {hint} {error} {required}>
  <input
    {id}
    {type}
    {value}
    {disabled}
    {maxlength}
    {placeholder}
    class={[inputClass, disabled && 'cursor-not-allowed opacity-60']}
    aria-invalid={error ? true : undefined}
    aria-describedby={error ? `${id}-error` : undefined}
    oninput={(event) => oninput(event.currentTarget.value)}
  />
</Field>
