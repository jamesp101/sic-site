<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
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
  let processing = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});
  // Changing the email (the password-reset address) requires the current password.
  const emailChanged = $derived(email.trim().toLowerCase() !== initialEmail.toLowerCase());

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    errors = {};
    const { error: failure } = await actions.account.updateProfile({
      name,
      email,
      currentPassword: emailChanged ? currentPassword : undefined,
    });
    processing = false;
    currentPassword = '';
    if (!failure) {
      // The layout shows the queued toast and re-renders the user menu with the new name.
      await reloadView();
      return;
    }
    errors = fieldErrors(failure);
    if (failure.code === 'CONFLICT') errors.email = failure.message;
    else if (failure.code === 'BAD_REQUEST' && Object.keys(errors).length === 0) errors.currentPassword = failure.message;
    else if (Object.keys(errors).length === 0) error = failure.message;
  }
</script>

<form method="post" onsubmit={submit} class="space-y-6">
  <Notice kind="error" message={error} />

  <Field id="name" label="Name" error={errors.name}>
    {#snippet children(props)}
      <Input {...props} name="name" required autocomplete="name" placeholder="Full name" bind:value={name} />
    {/snippet}
  </Field>

  <Field id="email" label="Email address" error={errors.email}>
    {#snippet children(props)}
      <Input {...props} type="email" name="email" required autocomplete="username" placeholder="Email address" bind:value={email} />
    {/snippet}
  </Field>

  {#if emailChanged}
    <Field id="current_password" label="Current password" error={errors.currentPassword}>
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

  <Button type="submit" disabled={processing} data-test="update-profile-button">
    {processing ? 'Saving…' : 'Save'}
  </Button>
</form>
