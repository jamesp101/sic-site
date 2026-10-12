<script lang="ts">
  import { actions } from 'astro:actions';
  import { untrack } from 'svelte';
  import { reloadView } from '@/lib/navigation';
  import { navUrlError } from '@/lib/nav-tree';
  import Field from '../shared/Field.svelte';
  import { inputClass, parseActionError, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';

  export interface NavLinkFormValues {
    id: number;
    label: string;
    url: string;
    order: number;
    isActive: boolean;
    parentId: number | null;
  }

  let {
    link = null,
    parentId = null,
    parentLabel = '',
    nextOrder = 1,
    prefix,
    oncancel,
  }: {
    /** Link being edited; null creates a new one. */
    link?: NavLinkFormValues | null;
    /** Parent for a new link (ignored when editing). */
    parentId?: number | null;
    parentLabel?: string;
    nextOrder?: number;
    /** Makes element ids unique when several forms are open. */
    prefix: string;
    oncancel: () => void;
  } = $props();

  const initial = untrack(() => link);
  let label = $state(initial?.label ?? '');
  let url = $state(initial?.url ?? '');
  let isActive = $state(initial?.isActive ?? true);
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');
  let labelInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    labelInput?.focus();
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};
    message = '';
    const urlProblem = navUrlError(url);
    if (urlProblem || !label.trim()) {
      if (urlProblem) errors.url = urlProblem;
      if (!label.trim()) errors.label = 'The label is required.';
      return;
    }
    processing = true;
    const payload = {
      label,
      url,
      isActive,
      order: initial?.order ?? untrack(() => nextOrder),
      parentId: initial ? initial.parentId : untrack(() => parentId),
    };
    const { error } = initial
      ? await actions.navlinks.update({ id: initial.id, ...payload })
      : await actions.navlinks.create(payload);
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    await reloadView();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      oncancel();
    }
  }
</script>

<form
  method="post"
  onsubmit={submit}
  onkeydown={onKeydown}
  aria-label={initial ? `Edit ${initial.label}` : parentLabel ? `Add link under ${parentLabel}` : 'Add link'}
  class="space-y-4 rounded-lg border border-border-strong bg-surface-alt p-4"
>
  <p class="text-sm font-semibold text-foreground">
    {#if initial}Edit link{:else if parentLabel}New link under “{parentLabel}”{:else}New top-level link{/if}
  </p>
  <div class="grid gap-4 md:grid-cols-2">
    <Field id={`${prefix}-label`} label="Label" required error={errors.label}>
      <input
        id={`${prefix}-label`}
        bind:this={labelInput}
        type="text"
        required
        maxlength="255"
        bind:value={label}
        class={inputClass}
        placeholder="e.g. Admissions"
      />
    </Field>
    <Field id={`${prefix}-url`} label="URL" required error={errors.url} hint="A path such as /posts or a full https:// URL.">
      <input id={`${prefix}-url`} type="text" required maxlength="255" bind:value={url} class={inputClass} placeholder="/posts" />
    </Field>
  </div>

  <label class="flex cursor-pointer items-center gap-3 text-sm text-foreground">
    <input type="checkbox" bind:checked={isActive} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
    <span>Visible in navigation</span>
  </label>

  {#if message}
    <p class="text-sm font-medium text-destructive" role="alert">{message}</p>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button type="submit" class={primaryButtonClass} disabled={processing}>
      {processing ? 'Saving…' : initial ? 'Save changes' : 'Add link'}
    </button>
    <button type="button" class={secondaryButtonClass} onclick={oncancel} disabled={processing}>Cancel</button>
  </div>
</form>
