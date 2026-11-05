<script lang="ts">
  import { actions } from 'astro:actions';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';
  import Field from './Field.svelte';
  import Notice from './Notice.svelte';

  let { redirect = '/dashboard' }: { redirect?: string } = $props();

  let password = $state('');

  const form = actionForm({
    async run() {
      const result = await actions.account.confirmPassword({ password });
      if (result.error) password = '';
      return result;
    },
    // A full page load: the session changed.
    onSuccess: () => window.location.assign(redirect),
  });
</script>

<form method="post" onsubmit={form.submit} class="grid gap-6">
  <Notice kind="error" message={form.message} />
  <Field id="password" label="Password" error={form.errors.password}>
    {#snippet children(props)}
      <PasswordInput {...props} class="h-11" name="password" required autocomplete="current-password" bind:value={password} />
    {/snippet}
  </Field>
  <Button type="submit" class="h-11 w-full" disabled={form.processing} data-test="confirm-password-button">
    {form.processing ? 'Confirming…' : 'Confirm password'}
  </Button>
</form>
