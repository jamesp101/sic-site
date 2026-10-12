<script lang="ts">
  import { actions } from 'astro:actions';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';
  import { fieldErrors } from './action-errors';
  import Field from './Field.svelte';
  import Notice from './Notice.svelte';

  let { redirect = '/dashboard' }: { redirect?: string } = $props();

  let password = $state('');
  let processing = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    errors = {};
    const { error: failure } = await actions.account.confirmPassword({ password });
    processing = false;
    if (failure) {
      errors = fieldErrors(failure);
      if (!errors.password) error = failure.message;
      password = '';
      return;
    }
    window.location.assign(redirect);
  }
</script>

<form method="post" onsubmit={submit} class="grid gap-6">
  <Notice kind="error" message={error} />
  <Field id="password" label="Password" error={errors.password}>
    {#snippet children(props)}
      <PasswordInput {...props} name="password" required autocomplete="current-password" bind:value={password} />
    {/snippet}
  </Field>
  <Button type="submit" class="w-full" disabled={processing} data-test="confirm-password-button">
    {processing ? 'Confirming…' : 'Confirm password'}
  </Button>
</form>
