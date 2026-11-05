<script lang="ts">
  import { navigate } from 'astro:transitions/client';
  import { onMount } from 'svelte';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { createUnsavedGuard, type Held } from './unsaved-guard';

  let {
    dirty,
    description = 'This page has changes that have not been saved. Leaving it will lose them.',
  }: {
    /** True while the page holds changes that leaving would lose; saving makes it false. */
    dirty: boolean;
    description?: string;
  } = $props();

  /** Navigation or form submit held back until the user decides. */
  let held = $state.raw<Held | null>(null);

  const guard = createUnsavedGuard({ isDirty: () => dirty, onHold: (next) => (held = next), navigate });
  onMount(() => guard.install());

  function discard() {
    const target = held;
    held = null;
    if (target) void guard.proceed(target);
  }
</script>

<ConfirmDialog
  bind:open={() => held !== null, (value) => { if (!value) held = null; }}
  title="Discard unsaved changes?"
  {description}
  confirmLabel="Discard"
  cancelLabel="Keep editing"
  destructive
  onConfirm={discard}
/>
