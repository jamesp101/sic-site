<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import { secondaryButtonClass } from '../../shared/form-utils';

  let { label, onclick, disabled = false }: { label: string; onclick: () => void; disabled?: boolean } = $props();
</script>

<button
  type="button"
  class={[secondaryButtonClass, 'px-3! py-1.5! disabled:cursor-not-allowed disabled:opacity-60']}
  {disabled}
  {onclick}
>
  <Plus class="h-4 w-4" aria-hidden="true" />
  {label}
</button>
