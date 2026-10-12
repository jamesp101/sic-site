<script lang="ts">
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { authClient } from '@/lib/auth-client';
  import Field from './Field.svelte';
  import Notice from './Notice.svelte';

  let email = $state('');
  let processing = $state(false);
  let status = $state('');
  let error = $state('');

  const NEUTRAL = 'If an account exists for that email address, a password reset link has been sent.';

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    status = '';
    error = '';
    try {
      const { error: failure } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
      // Never reveal whether the address exists: only throttling is surfaced.
      if (failure?.status === 429) error = 'Too many requests. Please wait a minute and try again.';
      else status = NEUTRAL;
    } catch {
      error = 'Could not reach the server. Please try again.';
    } finally {
      processing = false;
    }
  }
</script>

<form method="post" onsubmit={submit} class="grid gap-6">
  <Notice kind="success" message={status} />
  <Notice kind="error" message={error} />

  <Field id="email" label="Email address">
    {#snippet children(props)}
      <Input {...props} type="email" name="email" required autocomplete="email" placeholder="email@example.com" bind:value={email} />
    {/snippet}
  </Field>

  <Button type="submit" class="w-full" disabled={processing} data-test="email-password-reset-link-button">
    {processing ? 'Sending…' : 'Email password reset link'}
  </Button>
</form>
