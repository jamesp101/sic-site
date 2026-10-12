<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { append, inputClass, parseActionError } from '../shared/form-utils';

  export interface CarouselFormValues {
    id: number;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
    order: number;
    departmentId: number | null;
    showOnMain: boolean;
    imageUrl: string;
  }

  let {
    item = null,
    departments = [],
    lockDepartment = false,
    nextOrder = 1,
  }: {
    item?: CarouselFormValues | null;
    departments?: { id: number; name: string }[];
    /** Department users: the slide always belongs to their department. */
    lockDepartment?: boolean;
    nextOrder?: number;
  } = $props();

  const initial = untrack(() => item);
  let title = $state(initial?.title ?? '');
  let subtitle = $state(initial?.subtitle ?? '');
  let linkUrl = $state(initial?.linkUrl ?? '');
  let order = $state(String(initial?.order ?? untrack(() => nextOrder)));
  let departmentId = $state(
    initial?.departmentId != null ? String(initial.departmentId) : untrack(() => (lockDepartment ? String(departments[0]?.id ?? '') : '')),
  );
  let showOnMain = $state(initial?.showOnMain ?? true);
  let image = $state<File | null>(null);
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    errors = {};
    message = '';
    if (!initial && !image) {
      errors = { image: 'Choose a slide image.' };
      return;
    }
    processing = true;

    const form = new FormData();
    if (initial) append(form, 'id', initial.id);
    append(form, 'title', title);
    append(form, 'subtitle', subtitle);
    append(form, 'linkUrl', linkUrl);
    append(form, 'order', order);
    append(form, 'departmentId', departmentId || null);
    append(form, 'showOnMain', showOnMain);
    append(form, 'image', image);

    const { error } = initial ? await actions.carousels.update(form) : await actions.carousels.create(form);
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    await navigate('/admin/carousels');
  }
</script>

<form method="post" onsubmit={submit} class="space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
  <ImageField
    bind:file={image}
    id="image"
    label="Slide image"
    required={!initial}
    existingUrl={initial?.imageUrl ?? null}
    aspectRatio={16 / 9}
    cropTitle="Crop Slide Image (16:9)"
    hint="PNG, JPG, WebP or GIF (max 5 MB)"
    fit="cover"
    error={errors.image}
  />

  <Field id="title" label="Title" error={errors.title}>
    <input id="title" type="text" maxlength="255" bind:value={title} class={inputClass} placeholder="Headline shown on the slide" />
  </Field>

  <Field id="subtitle" label="Subtitle" error={errors.subtitle}>
    <input id="subtitle" type="text" maxlength="255" bind:value={subtitle} class={inputClass} placeholder="Short supporting text" />
  </Field>

  <div class="grid gap-6 md:grid-cols-2">
    <Field id="order" label="Display order" required error={errors.order} hint="Lower numbers appear first.">
      <input id="order" type="number" step="1" required bind:value={order} class={inputClass} />
    </Field>
    <Field id="linkUrl" label="Link URL" error={errors.linkUrl} hint="Optional. A path such as /posts or a full URL.">
      <input id="linkUrl" type="text" maxlength="255" bind:value={linkUrl} class={inputClass} placeholder="/posts" />
    </Field>
  </div>

  <Field id="departmentId" label="Department page" error={errors.departmentId}>
    {#if lockDepartment}
      <select id="departmentId" bind:value={departmentId} class={inputClass} disabled>
        {#each departments as department (department.id)}
          <option value={String(department.id)}>{department.name}</option>
        {/each}
      </select>
    {:else}
      <select id="departmentId" bind:value={departmentId} class={inputClass}>
        <option value="">None (main page only)</option>
        {#each departments as department (department.id)}
          <option value={String(department.id)}>{department.name}</option>
        {/each}
      </select>
    {/if}
  </Field>

  <fieldset class="space-y-2 rounded-lg border border-border bg-surface-alt p-4">
    <legend class="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Visibility</legend>
    <label class="flex cursor-pointer items-start gap-3">
      <input type="checkbox" bind:checked={showOnMain} class="mt-0.5 h-4 w-4 rounded border-border-strong accent-brand-800" />
      <span class="flex flex-col">
        <span class="text-sm font-semibold text-foreground">Display on the main page</span>
        <span class="text-xs text-muted-foreground">Show this slide in the home page carousel.</span>
      </span>
    </label>
  </fieldset>

  <FormActions cancelHref="/admin/carousels" {processing} submitLabel={initial ? 'Save changes' : 'Add slide'} {message} />
</form>
