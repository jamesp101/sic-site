<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import { MIN_PASSWORD_LENGTH } from '@/lib/password-policy';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import Field from '@/components/auth/Field.svelte';
  import Notice from '@/components/auth/Notice.svelte';
  import { fieldErrors } from '@/components/auth/action-errors';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';

  let currentPassword = $state('');
  let password = $state('');
  let passwordConfirmation = $state('');

  const form = actionForm({
    parse(failure) {
      const { code, message } = failure as { code?: string; message: string };
      const fields = fieldErrors(failure);
      if (Object.keys(fields).length > 0) return { fields, message: '' };
      return code === 'BAD_REQUEST' ? { fields: { currentPassword: message }, message: '' } : { fields, message };
    },
    async run() {
      const result = await actions.account.changePassword({ currentPassword, password, passwordConfirmation });
      if (result.error) currentPassword = password = passwordConfirmation = '';
      return result;
    },
    onSuccess: () => reloadView(),
  });
</script>

<form method="post" onsubmit={form.submit} class="space-y-6">
  <Notice kind="error" message={form.message} />

  <Field id="current_password" label="Current password" error={form.errors.currentPassword}>
    {#snippet children(props)}
      <PasswordInput {...props} name="current_password" required autocomplete="current-password" placeholder="Current password" bind:value={currentPassword} />
    {/snippet}
  </Field>

  <Field id="password" label="New password" error={form.errors.password}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password" required minlength={MIN_PASSWORD_LENGTH} autocomplete="new-password" placeholder="New password" bind:value={password} />
    {/snippet}
  </Field>

  <Field id="password_confirmation" label="Confirm password" error={form.errors.passwordConfirmation}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password_confirmation" required autocomplete="new-password" placeholder="Confirm password" bind:value={passwordConfirmation} />
    {/snippet}
  </Field>

  <Button type="submit" disabled={form.processing} data-test="update-password-button">
    {form.processing ? 'Saving…' : 'Save'}
  </Button>
</form>
