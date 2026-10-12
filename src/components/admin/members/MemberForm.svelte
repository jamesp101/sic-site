<script lang="ts">
  import { actions } from 'astro:actions';
  import { untrack } from 'svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { append, inputClass, parseActionError } from '../shared/form-utils';

  export interface MemberFormValues {
    id: number;
    name: string;
    role: string;
    parentId: number | null;
    order: number;
    imageUrl: string | null;
  }

  let {
    departmentId,
    member = null,
    parents = [],
    nextOrder = 1,
  }: {
    departmentId: number;
    member?: MemberFormValues | null;
    /** Candidate supervisors: members of this department (excluding the member being edited and its descendants). */
    parents?: { id: number; name: string; role: string }[];
    nextOrder?: number;
  } = $props();

  const initial = untrack(() => member);
  let name = $state(initial?.name ?? '');
  let role = $state(initial?.role ?? '');
  let parentId = $state(initial?.parentId === null || initial === null ? '' : String(initial.parentId));
  let order = $state(String(initial?.order ?? untrack(() => nextOrder)));
  let image = $state<File | null>(null);
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  const backHref = untrack(() => `/admin/departments/${departmentId}/members`);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const form = new FormData();
    if (initial) append(form, 'id', initial.id);
    append(form, 'departmentId', departmentId);
    append(form, 'name', name);
    append(form, 'role', role);
    append(form, 'parentId', parentId || null);
    append(form, 'order', order);
    append(form, 'image', image);

    const { error } = initial ? await actions.members.update(form) : await actions.members.create(form);
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    window.location.assign(backHref);
  }
</script>

<form onsubmit={submit} class="space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
  <ImageField
    bind:file={image}
    id="image"
    label="Photo"
    existingUrl={initial?.imageUrl ?? null}
    aspectRatio={1}
    cropTitle="Crop Profile Photo (1:1)"
    hint="PNG, JPG, WebP or GIF (max 2 MB)"
    fit="cover"
    error={errors.image}
  />

  <Field id="name" label="Full name" required error={errors.name}>
    <input id="name" type="text" required maxlength="255" bind:value={name} class={inputClass} placeholder="e.g. Juan Dela Cruz" />
  </Field>

  <Field id="role" label="Role / position title" required error={errors.role}>
    <input id="role" type="text" required maxlength="255" bind:value={role} class={inputClass} placeholder="e.g. Department Head" />
  </Field>

  <div class="grid gap-6 md:grid-cols-2">
    <Field id="parentId" label="Reports to" error={errors.parentId} hint="Leave empty for a top-level member.">
      <select id="parentId" bind:value={parentId} class={inputClass}>
        <option value="">None (top level)</option>
        {#each parents as parent (parent.id)}
          <option value={String(parent.id)}>{parent.name} — {parent.role}</option>
        {/each}
      </select>
    </Field>

    <Field id="order" label="Display order" required error={errors.order} hint="Lower numbers appear first.">
      <input id="order" type="number" step="1" required bind:value={order} class={inputClass} />
    </Field>
  </div>

  <FormActions cancelHref={backHref} {processing} submitLabel={initial ? 'Save changes' : 'Add member'} {message} />
</form>
