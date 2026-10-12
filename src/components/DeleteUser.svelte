<script lang="ts">
  import { actions } from 'astro:actions';
  import Field from '@/components/auth/Field.svelte';
  import Notice from '@/components/auth/Notice.svelte';
  import { fieldErrors } from '@/components/auth/action-errors';
  import Heading from '@/components/Heading.svelte';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';
  import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

  let open = $state(false);
  let password = $state('');
  let processing = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    errors = {};
    const { data, error: failure } = await actions.account.deleteAccount({ password });
    if (!failure) {
      window.location.assign(data.redirect);
      return;
    }
    processing = false;
    password = '';
    errors = fieldErrors(failure);
    if (failure.code === 'BAD_REQUEST' && !errors.password) errors.password = failure.message;
    else if (!errors.password) error = failure.message;
  }
</script>

<div class="space-y-6">
  <Heading variant="small" title="Delete account" description="Delete your account and all of its resources" />
  <div class="space-y-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
    <div class="space-y-0.5 text-destructive">
      <p class="font-medium">Warning</p>
      <p class="text-sm">Please proceed with caution, this cannot be undone.</p>
    </div>
    <Dialog bind:open>
      <DialogTrigger asChild>
        {#snippet children(props)}
          <Button variant="destructive" data-test="delete-user-button" onclick={props.onClick as () => void}>Delete account</Button>
        {/snippet}
      </DialogTrigger>
      <DialogContent>
        <form method="post" onsubmit={submit} class="space-y-6">
          <div class="space-y-3">
            <DialogTitle>Are you sure you want to delete your account?</DialogTitle>
            <DialogDescription>
              Once your account is deleted, all of its resources and data will also be permanently deleted. Please enter your password to
              confirm you would like to permanently delete your account.
            </DialogDescription>
          </div>

          <Notice kind="error" message={error} />

          <Field id="delete_password" label="Password" error={errors.password}>
            {#snippet children(props)}
              <PasswordInput {...props} name="password" required autocomplete="current-password" placeholder="Password" bind:value={password} />
            {/snippet}
          </Field>

          <DialogFooter class="gap-2">
            <DialogClose>
              <Button variant="secondary">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={processing} data-test="confirm-delete-user-button">
              {processing ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</div>
