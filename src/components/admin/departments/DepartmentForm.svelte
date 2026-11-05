<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { onMount, untrack } from 'svelte';
  import UnsavedChangesGuard from '../shared/UnsavedChangesGuard.svelte';
  import { unsavedChanges } from '../shared/unsaved-changes.svelte';
  import { actionForm } from '../shared/action-form.svelte';
  import Field from '../shared/Field.svelte';
  import FormActions from '../shared/FormActions.svelte';
  import ImageField from '../shared/ImageField.svelte';
  import { append, inputClass } from '../shared/form-utils';
  import { cardClass } from '../ui';

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

  // CodeMirror is heavy: load the editor after the form is interactive instead of bundling it with the form.
  let Editor = $state.raw<typeof import('@/components/MarkdownEditor.svelte').default | null>(null);
  let editorError = $state(false);
  onMount(() => {
    import('@/components/MarkdownEditor.svelte').then(
      (module) => (Editor = module.default),
      () => (editorError = true),
    );
  });

  const unsaved = unsavedChanges(() => [name, description, heroContent, logo !== null]);

  const form = actionForm({
    fieldByCode: { CONFLICT: 'name' },
    run() {
      const data = new FormData();
      if (initial) append(data, 'id', initial.id);
      append(data, 'name', name);
      append(data, 'description', description);
      append(data, 'heroContent', heroContent);
      append(data, 'logo', logo);
      return initial ? actions.departments.update(data) : actions.departments.create(data);
    },
    onSuccess: () => {
      unsaved.markSaved();
      return navigate('/admin/departments');
    },
  });
</script>

<form method="post" onsubmit={form.submit} data-unsaved-own class="space-y-6">
  <div class="{cardClass} space-y-6 p-6">
  <Field id="name" label="Department name" required error={form.errors.name}>
    {#snippet children(props)}
      <input
        {...props}
        type="text"
        required
        maxlength="255"
        bind:value={name}
        class={inputClass}
        placeholder="e.g. College Department"
      />
    {/snippet}
  </Field>

  <Field id="description" label="Short description" error={form.errors.description}>
    {#snippet children(props)}
      <textarea {...props} rows="3" bind:value={description} class={inputClass} placeholder="Brief overview of the department."></textarea>
    {/snippet}
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
    {#if Editor}
      <Editor bind:value={heroContent} id="hero-content" label="Hero content (Markdown / MDX)" rows={8} error={form.errors.heroContent ?? ''} />
    {:else}
      <!-- Same box as the editor (label, toolbar, 200 px of text) so nothing shifts when CodeMirror arrives. -->
      <div class="w-full space-y-1.5" aria-busy={!editorError}>
        <p class="text-sm font-semibold text-foreground">Hero content (Markdown / MDX)</p>
        <div class="flex h-[15.5rem] items-center justify-center rounded-xl border border-border-strong bg-surface-alt text-sm text-muted-foreground shadow-brand-sm">
          {#if editorError}
            <span role="alert" class="text-destructive">The editor could not be loaded. Reload the page to try again.</span>
          {:else}
            <span role="status">Loading editor…</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  </div>

  <FormActions cancelHref="/admin/departments" processing={form.processing} submitLabel={initial ? 'Save changes' : 'Save department'} message={form.message} />
</form>

<UnsavedChangesGuard dirty={unsaved.dirty} />
