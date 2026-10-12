<script lang="ts">
  import { Button } from '@/components/ui/button';
  import { authClient } from '@/lib/auth-client';
  import Notice from './Notice.svelte';

  let { email }: { email: string } = $props();

  let processing = $state(false);
  let status = $state('');
  let error = $state('');

  async function resend(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    status = '';
    error = '';
    try {
      const { error: failure } = await authClient.sendVerificationEmail({ email, callbackURL: '/dashboard' });
      if (failure) error = failure.status === 429 ? 'Too many requests. Please wait a minute.' : 'Could not send the email. Please try again.';
      else status = 'A new verification link has been sent to your email address.';
    } catch {
      error = 'Could not reach the server. Please try again.';
    } finally {
      processing = false;
    }
  }

  async function logout() {
    await authClient.signOut();
    window.location.assign('/login');
  }
</script>

<div class="grid gap-6 text-center">
  <Notice kind="success" message={status} />
  <Notice kind="error" message={error} />
  <form onsubmit={resend}>
    <Button type="submit" variant="secondary" disabled={processing}>
      {processing ? 'Sending…' : 'Resend verification email'}
    </Button>
  </form>
  <button
    type="button"
    onclick={logout}
    class="mx-auto text-sm text-link underline decoration-border-strong underline-offset-4 hover:text-brand-700"
  >
    Log out
  </button>
</div>
