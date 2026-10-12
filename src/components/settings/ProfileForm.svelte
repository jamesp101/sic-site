<script lang="ts">
  import { actions } from 'astro:actions';
  import { reloadView } from '@/lib/navigation';
  import Field from '@/components/auth/Field.svelte';
  import Notice from '@/components/auth/Notice.svelte';
  import { fieldErrors } from '@/components/auth/action-errors';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';

  let { name: initialName, email: initialEmail, emailVerified }: { name: string; email: string; emailVerified: boolean } = $props();

  let name = $state(initialName);
  let email = $state(initialEmail);
  let processing = $state(false);
  let error = $state('');
  let errors = $state<Record<string, string>>({});

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    errors = {};
    const { error: failure } = await actions.account.updateProfile({ name, email });
    processing = false;
    if (!failure) {
      // The layout shows the queued toast and re-renders the user menu with the new name.
      await reloadView();
      return;
    }
    errors = fieldErrors(failure);
    if (failure.code === 'CONFLICT') errors.email = failure.message;
    else if (Object.keys(errors).length === 0) error = failure.message;
  }
</script>

<form onsubmit={submit} class="space-y-6">
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
