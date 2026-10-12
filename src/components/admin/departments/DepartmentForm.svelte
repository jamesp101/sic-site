<script lang="ts">
  import { actions } from 'astro:actions';
  import { untrack } from 'svelte';
  import MarkdownEditor from '@/components/MarkdownEditor.svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { append, inputClass, parseActionError } from '../shared/form-utils';

  export interface DepartmentFormValues {
    id: number;
    name: string;
    description: string | null;
    heroContent: string | null;
    logoUrl: string | null;
  }

  let { department = null }: { department?: DepartmentFormValues | null } = $props();

  const initial = untrack(() => department);
  let name = $state(initial?.name ?? '');
  let description = $state(initial?.description ?? '');
  let heroContent = $state(initial?.heroContent ?? '');
  let logo = $state<File | null>(null);
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const form = new FormData();
    if (initial) append(form, 'id', initial.id);
    append(form, 'name', name);
    append(form, 'description', description);
    append(form, 'heroContent', heroContent);
    append(form, 'logo', logo);

    const { error } = initial ? await actions.departments.update(form) : await actions.departments.create(form);
    if (error) {
      const parsed = parseActionError(error, 'name');
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    window.location.assign('/admin/departments');
  }
</script>

<form onsubmit={submit} class="relative space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
  <Field id="name" label="Department name" required error={errors.name}>
    <input
      id="name"
      type="text"
      required
      maxlength="255"
      bind:value={name}
      class={inputClass}
      aria-describedby={errors.name ? 'name-error' : undefined}
      placeholder="e.g. College Department"
    />
  </Field>

  <Field id="description" label="Short description" error={errors.description}>
    <textarea id="description" rows="3" bind:value={description} class={inputClass} placeholder="Brief overview of the department."></textarea>
  </Field>

  <ImageField
    bind:file={logo}
    id="logo"
    label="Department logo"
    existingUrl={initial?.logoUrl ?? null}
    aspectRatio={1}
    cropTitle="Crop Department Logo (1:1)"
    hint="PNG, JPG, WebP or GIF (max 5 MB)"
    error={errors.logo}
  />

  <div class="space-y-1.5">
    <MarkdownEditor bind:value={heroContent} id="hero-content" label="Hero content (Markdown / MDX)" rows={8} error={errors.heroContent ?? ''} />
  </div>

  <FormActions cancelHref="/admin/departments" {processing} submitLabel={initial ? 'Save changes' : 'Save department'} {message} />
</form>
