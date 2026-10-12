<script lang="ts">
  import PasswordInput from '@/components/PasswordInput.svelte';
  import TextLink from '@/components/TextLink.svelte';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { authClient } from '@/lib/auth-client';
  import Field from './Field.svelte';
  import Notice from './Notice.svelte';

  let { redirect = '/dashboard', status = '' }: { redirect?: string; status?: string } = $props();

  let email = $state('');
  let password = $state('');
  let remember = $state(false);
  let processing = $state(false);
  let error = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    error = '';
    try {
      const { error: failure } = await authClient.signIn.email({ email, password, rememberMe: remember });
      if (failure) {
        error =
          failure.status === 429
            ? 'Too many attempts. Please wait a minute and try again.'
            : 'These credentials do not match our records.';
        password = '';
        return;
      }
      window.location.assign(redirect);
    } catch {
      error = 'Could not reach the server. Please try again.';
    } finally {
      processing = false;
    }
  }
</script>

<form onsubmit={submit} class="grid gap-6">
  <Notice kind="success" message={status} />
  <Notice kind="error" message={error} />

  <Field id="email" label="Email address">
    {#snippet children(props)}
      <Input {...props} type="email" name="email" required autocomplete="email" placeholder="email@example.com" bind:value={email} />
    {/snippet}
  </Field>

  <Field id="password" label="Password">
    {#snippet labelAside()}
      <TextLink href="/forgot-password" class="text-sm">Forgot your password?</TextLink>
    {/snippet}
    {#snippet children(props)}
      <PasswordInput {...props} name="password" required autocomplete="current-password" placeholder="Password" bind:value={password} />
    {/snippet}
  </Field>

  <label class="flex items-center gap-3 text-sm font-medium">
    <input type="checkbox" name="remember" bind:checked={remember} class="size-4 rounded border-input accent-primary" />
    <span>Remember me</span>
  </label>

  <Button type="submit" class="w-full" disabled={processing} data-test="login-button">
    {processing ? 'Signing in…' : 'Log in'}
  </Button>
</form>
