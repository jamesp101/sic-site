<script lang="ts">
  import { actions, isInputError } from 'astro:actions';

  type Fields = 'name' | 'email' | 'subject' | 'message';
  type FieldErrors = Partial<Record<Fields, string[]>>;

  let {
    action,
    values = {},
    fieldErrors = {},
    formError = null,
    sent = false,
  }: {
    /** Query string of the Astro action (`?_action=contact.send`), used by the no-JS POST. */
    action: string;
    values?: Partial<Record<Fields, string>>;
    fieldErrors?: FieldErrors;
    formError?: string | null;
    sent?: boolean;
  } = $props();

  // Server-rendered state seeds the form; client submissions then keep it up to date.
  let errors = $state<FieldErrors>({ ...fieldErrors });
  let error = $state<string | null>(formError);
  let success = $state(sent);
  let pending = $state(false);
  let status: HTMLElement | undefined = $state();
  let form: HTMLFormElement | undefined = $state();

  async function onsubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!form || pending) return;
    pending = true;
    errors = {};
    error = null;
    success = false;

    const { error: failure } = await actions.contact.send(new FormData(form));
    pending = false;

    if (!failure) {
      success = true;
      form.reset();
    } else if (isInputError(failure)) {
      errors = failure.fields as FieldErrors;
      error = 'Please fix the highlighted fields and try again.';
    } else {
      error = failure.message || 'Your message could not be sent. Please try again or email us directly.';
    }
    queueMicrotask(() => status?.focus());
  }

  const fields: { name: 'name' | 'email' | 'subject'; label: string; type: string; autocomplete: 'name' | 'email' | 'off' }[] = [
    { name: 'name', label: 'Full name', type: 'text', autocomplete: 'name' },
    { name: 'email', label: 'Email address', type: 'email', autocomplete: 'email' },
    { name: 'subject', label: 'Subject', type: 'text', autocomplete: 'off' },
  ];

  const input =
    'block w-full rounded-xl border border-border-strong bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground aria-[invalid=true]:border-destructive';
  const label = 'mb-1.5 block text-sm font-semibold text-foreground';
</script>

<div
  bind:this={status}
  tabindex="-1"
  role={error ? 'alert' : 'status'}
  class="outline-none empty:hidden"
>
  {#if success}
    <p class="rounded-xl bg-status-article-bg p-4 text-sm font-medium text-status-article-fg">
      Thank you. Your message has been sent and the college will reply to your email address.
    </p>
  {:else if error}
    <p class="rounded-xl bg-status-announcement-bg p-4 text-sm font-medium text-status-announcement-fg">{error}</p>
  {/if}
</div>

<form method="post" {action} {onsubmit} class="mt-6 space-y-5">
  {#each fields as f (f.name)}
    <div>
      <label for="contact-{f.name}" class={label}>{f.label}</label>
      <input
        id="contact-{f.name}"
        name={f.name}
        type={f.type}
        required
        maxlength="255"
        autocomplete={f.autocomplete}
        value={values[f.name] ?? ''}
        aria-invalid={errors[f.name] ? 'true' : undefined}
        aria-describedby={errors[f.name] ? `contact-${f.name}-error` : undefined}
        class={input}
      />
      {#if errors[f.name]}
        <p id="contact-{f.name}-error" class="mt-1.5 text-sm text-destructive">{errors[f.name]?.[0]}</p>
      {/if}
    </div>
  {/each}

  <div>
    <label for="contact-message" class={label}>Message</label>
    <textarea
      id="contact-message"
      name="message"
      rows="6"
      required
      maxlength="5000"
      aria-invalid={errors.message ? 'true' : undefined}
      aria-describedby={errors.message ? 'contact-message-error' : undefined}
      class={input}>{values.message ?? ''}</textarea
    >
    {#if errors.message}
      <p id="contact-message-error" class="mt-1.5 text-sm text-destructive">{errors.message[0]}</p>
    {/if}
  </div>

  <!-- Honeypot: hidden from people and assistive tech; bots fill it. -->
  <div class="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
    <label for="contact-website">Leave this field empty</label>
    <input id="contact-website" name="website" type="text" tabindex="-1" autocomplete="off" />
  </div>

  <button
    type="submit"
    disabled={pending}
    class="inline-flex w-full items-center justify-center rounded-xl bg-gold-500 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-brand-950 shadow-brand-sm transition hover:-translate-y-0.5 hover:bg-gold-400 disabled:opacity-60"
  >
    {pending ? 'Sending…' : 'Send message'}
  </button>
</form>
