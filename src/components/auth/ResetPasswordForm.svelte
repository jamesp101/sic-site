<script lang="ts">
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';
  import { authClient } from '@/lib/auth-client';
  import Field from './Field.svelte';
  import Notice from './Notice.svelte';

  let { token }: { token: string } = $props();

  let password = $state('');
  let confirmation = $state('');
  let processing = $state(false);
  let error = $state('');
  let errors = $state<{ password?: string; confirmation?: string }>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    errors = {};
    if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
    if (confirmation !== password) errors.confirmation = 'The password confirmation does not match.';
    if (errors.password || errors.confirmation) return;

    processing = true;
    try {
      const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
      if (failure) {
        error = 'This password reset link is invalid or has expired. Request a new one.';
        return;
      }
      window.location.assign('/login?status=password-reset');
    } catch {
      error = 'Could not reach the server. Please try again.';
    } finally {
      processing = false;
    }
  }
</script>

<form onsubmit={submit} class="grid gap-6">
  <Notice kind="error" message={error} />

  <Field id="password" label="New password" error={errors.password}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password" required minlength={8} autocomplete="new-password" placeholder="New password" bind:value={password} />
    {/snippet}
  </Field>

  <Field id="password_confirmation" label="Confirm password" error={errors.confirmation}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password_confirmation" required autocomplete="new-password" placeholder="Confirm password" bind:value={confirmation} />
    {/snippet}
  </Field>

  <Button type="submit" class="w-full" disabled={processing} data-test="reset-password-button">
    {processing ? 'Resetting…' : 'Reset password'}
  </Button>
</form>
