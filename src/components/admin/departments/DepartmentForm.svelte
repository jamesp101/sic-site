<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import MarkdownEditor from '@/components/MarkdownEditor.svelte';
  import { actionForm } from '../shared/action-form.svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { append, inputClass } from '../shared/form-utils';

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

  const form = actionForm({
    conflictField: 'name',
    run() {
      const data = new FormData();
      if (initial) append(data, 'id', initial.id);
      append(data, 'name', name);
      append(data, 'description', description);
      append(data, 'heroContent', heroContent);
      append(data, 'logo', logo);
      return initial ? actions.departments.update(data) : actions.departments.create(data);
    },
    onSuccess: () => navigate('/admin/departments'),
  });
</script>

<form method="post" onsubmit={form.submit} class="relative space-y-6 rounded-xl border border-border bg-card p-6 shadow-brand-sm">
  <Field id="name" label="Department name" required error={form.errors.name}>
    <input
      id="name"
      type="text"
      required
      maxlength="255"
      bind:value={name}
      class={inputClass}
      aria-describedby={form.errors.name ? 'name-error' : undefined}
      placeholder="e.g. College Department"
    />
  </Field>

  <Field id="description" label="Short description" error={form.errors.description}>
    <textarea id="description" rows="3" bind:value={description} class={inputClass} placeholder="Brief overview of the department."></textarea>
  </Field>

  <ImageField
    bind:file={logo}
    id="logo"
    target="logo"
    label="Department logo"
    existingUrl={initial?.logoUrl ?? null}
    aspectRatio={1}
    cropTitle="Crop Department Logo (1:1)"
    hint="PNG, JPG, WebP or GIF (max 5 MB)"
    error={form.errors.logo}
  />

  <div class="space-y-1.5">
    <MarkdownEditor bind:value={heroContent} id="hero-content" label="Hero content (Markdown / MDX)" rows={8} error={form.errors.heroContent ?? ''} />
  </div>

  <FormActions cancelHref="/admin/departments" processing={form.processing} submitLabel={initial ? 'Save changes' : 'Save department'} message={form.message} />
</form>
