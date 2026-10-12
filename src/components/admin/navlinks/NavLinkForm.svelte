<script lang="ts">
  import { actions } from 'astro:actions';
  import { untrack } from 'svelte';
  import NavLinkPreview from '@/components/NavLinkPreview.svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import { inputClass, parseActionError } from '../shared/form-utils';

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
    parentLinks = [],
    nextOrder = 0,
  }: {
    link?: NavLinkFormValues | null;
    /** Top-level links that may be chosen as parent (never the link itself). */
    parentLinks?: { id: number; label: string }[];
    nextOrder?: number;
  } = $props();

  const initial = untrack(() => link);
  let label = $state(initial?.label ?? '');
  let url = $state(initial?.url ?? '');
  let order = $state(String(initial?.order ?? untrack(() => nextOrder)));
  let isActive = $state(initial?.isActive ?? true);
  let parentId = $state(initial?.parentId != null ? String(initial.parentId) : '');
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  const parentLabel = $derived(parentLinks.find((parent) => String(parent.id) === parentId)?.label ?? '');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const orderNumber = Number(order);
    const payload = {
      label,
      url,
      order: order.trim() === '' || Number.isNaN(orderNumber) ? (Number.NaN as number) : orderNumber,
      isActive,
      parentId: parentId ? Number(parentId) : null,
    };
    const { error } = initial ? await actions.navlinks.update({ id: initial.id, ...payload }) : await actions.navlinks.create(payload);
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    window.location.assign('/admin/navlinks');
  }
</script>

<div class="space-y-6">
  <NavLinkPreview {label} {url} {isActive} {parentLabel} />

  <form onsubmit={submit} class="space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
    <div class="grid gap-6 md:grid-cols-2">
      <Field id="label" label="Label" required error={errors.label}>
        <input id="label" type="text" required maxlength="255" bind:value={label} class={inputClass} placeholder="e.g. Admissions" />
      </Field>
      <Field id="url" label="URL" required error={errors.url} hint="A path such as /posts or a full URL.">
        <input id="url" type="text" required maxlength="255" bind:value={url} class={inputClass} placeholder="/posts" />
      </Field>
      <Field id="parentId" label="Parent link" error={errors.parentId} hint="Leave empty for a top-level link.">
        <select id="parentId" bind:value={parentId} class={inputClass}>
          <option value="">None (top level)</option>
          {#each parentLinks as parent (parent.id)}
            <option value={String(parent.id)}>{parent.label}</option>
          {/each}
        </select>
      </Field>
      <Field id="order" label="Display order" required error={errors.order} hint="Lower numbers appear first.">
        <input id="order" type="number" step="1" required bind:value={order} class={inputClass} />
      </Field>
    </div>

    <label class="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-alt p-4">
      <input type="checkbox" bind:checked={isActive} class="mt-0.5 h-4 w-4 rounded border-border-strong accent-brand-800" />
      <span class="flex flex-col">
        <span class="text-sm font-semibold text-foreground">Visible in navigation</span>
        <span class="text-xs text-muted-foreground">Hidden links stay saved but are not shown on the site.</span>
      </span>
    </label>

    <FormActions cancelHref="/admin/navlinks" {processing} submitLabel={initial ? 'Save changes' : 'Add link'} {message} />
  </form>
</div>
