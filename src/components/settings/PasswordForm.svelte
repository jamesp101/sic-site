<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import Field from '@/components/auth/Field.svelte';
  import Notice from '@/components/auth/Notice.svelte';
  import { fieldErrors } from '@/components/auth/action-errors';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';

  let currentPassword = $state('');
  let password = $state('');
  let passwordConfirmation = $state('');
  let processing = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    errors = {};
    const { error: failure } = await actions.account.changePassword({ currentPassword, password, passwordConfirmation });
    processing = false;
    if (!failure) {
      await reloadView();
      return;
    }
    errors = fieldErrors(failure);
    if (failure.code === 'BAD_REQUEST' && Object.keys(errors).length === 0) errors.currentPassword = failure.message;
    else if (Object.keys(errors).length === 0) error = failure.message;
    currentPassword = password = passwordConfirmation = '';
  }
</script>

<form onsubmit={submit} class="space-y-6">
  <Notice kind="error" message={error} />

  <Field id="current_password" label="Current password" error={errors.currentPassword}>
    {#snippet children(props)}
      <PasswordInput {...props} name="current_password" required autocomplete="current-password" placeholder="Current password" bind:value={currentPassword} />
    {/snippet}
  </Field>

  <Field id="password" label="New password" error={errors.password}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password" required minlength={8} autocomplete="new-password" placeholder="New password" bind:value={password} />
    {/snippet}
  </Field>

  <Field id="password_confirmation" label="Confirm password" error={errors.passwordConfirmation}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password_confirmation" required autocomplete="new-password" placeholder="Confirm password" bind:value={passwordConfirmation} />
    {/snippet}
  </Field>

  <Button type="submit" disabled={processing} data-test="update-password-button">
    {processing ? 'Saving…' : 'Save'}
  </Button>
</form>
