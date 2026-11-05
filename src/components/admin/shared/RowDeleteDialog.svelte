<script lang="ts">
  import { actions } from 'astro:actions';
  import { toast } from 'svelte-sonner';
  import { reloadView } from '@/lib/navigation';
  import ConfirmDialog from '../ConfirmDialog.svelte';
  import { parseActionError } from './form-utils';
  import { ROW_DELETE, ROW_DELETE_ATTR, type RowDeleteKind } from './row-delete';

  /** Calls the delete action of each row kind. */
  const RUN: Record<RowDeleteKind, (id: number) => Promise<{ error?: unknown }>> = {
    post: (id) => actions.posts.delete({ id }),
    heroSection: (id) => actions.heroSections.delete({ id }),
    department: (id) => actions.departments.delete({ id }),
    user: (id) => actions.users.delete({ id }),
  };

  let target = $state<{ kind: RowDeleteKind; id: number; name: string; trigger: HTMLElement } | null>(null);
  let open = $state(false);
  let processing = $state(false);

  // One delegated listener serves every `DeleteRowButton` on the page.
  $effect(() => {
    function onClick(event: MouseEvent) {
      const trigger = (event.target as Element | null)?.closest<HTMLElement>(`[${ROW_DELETE_ATTR}]`);
      const kind = trigger?.getAttribute(ROW_DELETE_ATTR) as RowDeleteKind | undefined;
      const id = Number(trigger?.dataset.id);
      if (!trigger || !kind || !(kind in ROW_DELETE) || !Number.isInteger(id)) return;
      target = { kind, id, name: trigger.dataset.name ?? '', trigger };
      open = true;
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  });

  // Return focus to the row's button when the dialog closes without deleting.
  $effect(() => {
    if (!open && target && !processing) target.trigger.focus();
  });

  async function confirm() {
    if (!target) return;
    processing = true;
    const { error } = await RUN[target.kind](target.id);
    if (error) {
      processing = false;
      open = false;
      toast.error(parseActionError(error).message || 'The item could not be deleted.');
      return;
    }
    // Success reloads the list so the queued flash toast shows.
    await reloadView();
  }

  const text = $derived(target ? ROW_DELETE[target.kind] : null);
</script>

{#if target && text}
  <!-- The overlay and close control cannot dismiss the dialog while a delete is running. -->
  <ConfirmDialog
    bind:open={() => open, (next) => (open = next || processing)}
    title={text.title(target.name)}
    description={text.description}
    confirmLabel="Delete"
    destructive
    {processing}
    onConfirm={confirm}
  />
{/if}
