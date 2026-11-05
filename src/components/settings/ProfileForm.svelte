<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import Field from '@/components/auth/Field.svelte';
  import Notice from '@/components/auth/Notice.svelte';
  import { fieldErrors } from '@/components/auth/action-errors';
  import PasswordInput from '@/components/PasswordInput.svelte';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';

  let { name: initialName, email: initialEmail, emailVerified }: { name: string; email: string; emailVerified: boolean } = $props();

  let name = $state(initialName);
  let email = $state(initialEmail);
  let currentPassword = $state('');
  // Changing the email (the password-reset address) requires the current password.
  const emailChanged = $derived(email.trim().toLowerCase() !== initialEmail.toLowerCase());

  const form = actionForm({
    parse(failure) {
      const { code, message } = failure as { code?: string; message: string };
      const fields = fieldErrors(failure);
      if (code === 'CONFLICT') fields.email = message;
      else if (Object.keys(fields).length === 0) {
        return code === 'BAD_REQUEST' ? { fields: { currentPassword: message }, message: '' } : { fields, message };
      }
      return { fields, message: '' };
    },
    async run() {
      const result = await actions.account.updateProfile({
        name,
        email,
        currentPassword: emailChanged ? currentPassword : undefined,
      });
      currentPassword = '';
      return result;
    },
    // The layout shows the queued toast and re-renders the user menu with the new name.
    onSuccess: () => reloadView(),
  });
</script>

<form method="post" onsubmit={form.submit} class="space-y-6">
  <Notice kind="error" message={form.message} />

  <Field id="name" label="Name" error={form.errors.name}>
    {#snippet children(props)}
      <Input {...props} name="name" required autocomplete="name" placeholder="Full name" bind:value={name} />
    {/snippet}
  </Field>

  <Field id="email" label="Email address" error={form.errors.email}>
    {#snippet children(props)}
      <Input {...props} type="email" name="email" required autocomplete="username" placeholder="Email address" bind:value={email} />
    {/snippet}
  </Field>

  {#if emailChanged}
    <Field id="current_password" label="Current password" error={form.errors.currentPassword}>
      {#snippet children(props)}
        <PasswordInput {...props} name="current_password" required autocomplete="current-password" placeholder="Current password" bind:value={currentPassword} />
      {/snippet}
    </Field>
  {/if}

  {#if !emailVerified}
    <p class="-mt-2 text-sm text-muted-foreground">
      Your email address is unverified.
      <a href="/verify-email" class="text-link underline underline-offset-4 hover:text-brand-700">Send a verification email.</a>
    </p>
  {/if}

  <Button type="submit" disabled={form.processing} data-test="update-profile-button">
    {form.processing ? 'Saving…' : 'Save'}
  </Button>
</form>
