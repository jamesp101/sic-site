<script lang="ts">
  import { Trash } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { dangerIconButtonClass, parseActionError } from './form-utils';

  let {
    label,
    title,
    description = 'This action cannot be undone.',
    run,
    redirect = null,
  }: {
    /** Accessible name of the trigger button. */
    label: string;
    title: string;
    description?: string;
    /** Calls the delete action; success reloads the page (or goes to `redirect`) so the queued flash toast shows. */
    run: () => Promise<{ error?: unknown }>;
    redirect?: string | null;
  } = $props();

  let open = $state(false);
  let processing = $state(false);

  async function confirm() {
    processing = true;
    const { error } = await run();
    if (error) {
      processing = false;
      open = false;
      toast.error(parseActionError(error).message || 'The item could not be deleted.');
      return;
    }
    if (redirect) window.location.assign(redirect);
    else window.location.reload();
  }
</script>

<button type="button" onclick={() => (open = true)} class={dangerIconButtonClass} aria-label={label} title={label}>
  <Trash class="h-4 w-4" aria-hidden="true" />
</button>

<ConfirmDialog bind:open {title} {description} confirmLabel="Delete" destructive {processing} onConfirm={confirm} />
