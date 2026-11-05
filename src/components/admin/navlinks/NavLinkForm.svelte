<script lang="ts">
  import { actions } from 'astro:actions';
  import { untrack } from 'svelte';
  import { reloadView } from '@/lib/navigation';
  import { navUrlError, type LinkSuggestion } from '@/lib/nav-tree';
  import { actionForm } from '../shared/action-form.svelte';
  import Field from '../shared/Field.svelte';
  import NavKindBadge from './NavKindBadge.svelte';
  import NavLinkPicker from './NavLinkPicker.svelte';
  import { inputClass, primaryButtonClass, secondaryButtonClass } from '../shared/form-utils';

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
    suggestions = [],
    prefix,
    oncancel,
  }: {
    /** Link being edited; null creates a new one. */
    link?: NavLinkFormValues | null;
    /** Parent for a new link (ignored when editing). */
    parentId?: number | null;
    parentLabel?: string;
    nextOrder?: number;
    /** Grouped link suggestions for the URL combobox. */
    suggestions?: LinkSuggestion[];
    /** Makes element ids unique when several forms are open. */
    prefix: string;
    oncancel: () => void;
  } = $props();

  const initial = untrack(() => link);
  let label = $state(initial?.label ?? '');
  let url = $state(initial?.url ?? '');
  let isActive = $state(initial?.isActive ?? true);
  let labelInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    labelInput?.focus();
  });

  function onpick(suggestion: LinkSuggestion) {
    if (!label.trim()) label = suggestion.label;
  }

  const form = actionForm({
    run() {
      const fields: Record<string, string> = {};
      const urlProblem = navUrlError(url);
      if (urlProblem) fields.url = urlProblem;
      if (!label.trim()) fields.label = 'The label is required.';
      if (Object.keys(fields).length > 0) return Promise.resolve({ failure: { fields } });
      const payload = {
        label,
        url,
        isActive,
        order: initial?.order ?? untrack(() => nextOrder),
        parentId: initial ? initial.parentId : untrack(() => parentId),
      };
      return initial ? actions.navlinks.update({ id: initial.id, ...payload }) : actions.navlinks.create(payload);
    },
    onSuccess: () => reloadView(),
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      oncancel();
    }
  }
</script>

<form
  method="post"
  onsubmit={form.submit}
  onkeydown={onKeydown}
  aria-label={initial ? `Edit ${initial.label}` : parentLabel ? `Add link under ${parentLabel}` : 'Add link'}
  class="space-y-4 rounded-lg border border-border-strong bg-surface-alt p-4"
>
  <p class="text-sm font-semibold text-foreground">
    {#if initial}Edit link{:else if parentLabel}New link under “{parentLabel}”{:else}New top-level link{/if}
  </p>
  <div class="grid gap-4 md:grid-cols-2">
    <Field id={`${prefix}-label`} label="Label" required error={form.errors.label}>
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
    <Field
      id={`${prefix}-url`}
      label="URL"
      required
      error={form.errors.url}
      hint="Pick a page, department or post, or type a path such as /posts or a full https:// URL."
    >
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <NavLinkPicker
            id={`${prefix}-url`}
            bind:value={url}
            {suggestions}
            invalid={Boolean(form.errors.url)}
            describedBy={form.errors.url ? `${prefix}-url-error` : undefined}
            {onpick}
          />
        </div>
        <span class="mt-2"><NavKindBadge {url} /></span>
      </div>
    </Field>
  </div>

  <label class="flex cursor-pointer items-center gap-3 text-sm text-foreground">
    <input type="checkbox" bind:checked={isActive} class="h-4 w-4 rounded border-border-strong accent-brand-800" />
    <span>Visible in navigation</span>
  </label>

  {#if form.message}
    <p class="text-sm font-medium text-destructive" role="alert">{form.message}</p>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button type="submit" class={primaryButtonClass} disabled={form.processing}>
      {form.processing ? 'Saving…' : initial ? 'Save changes' : 'Add link'}
    </button>
    <button type="button" class={secondaryButtonClass} onclick={oncancel} disabled={form.processing}>Cancel</button>
  </div>
</form>
