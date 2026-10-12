<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { Folder, Tag, Upload } from '@lucide/svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import { append, formatFileSize, inputClass, parseActionError } from '@/components/admin/shared/form-utils';
  import { cardClass, selectClass } from '@/components/admin/ui';

  let {
    departments,
    directories,
    isSuperAdmin,
    maxMb = 20,
  }: {
    departments: { id: number; name: string }[];
    directories: string[];
    isSuperAdmin: boolean;
    maxMb?: number;
  } = $props();

  let file = $state<File | null>(null);
  let fileName = $state('');
  let directory = $state('');
  let tags = $state('');
  let departmentId = $state(isSuperAdmin ? '' : String(departments[0]?.id ?? ''));
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');

  function onFile(event: Event) {
    const chosen = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    file = chosen;
    if (chosen && !fileName) {
      const dot = chosen.name.lastIndexOf('.');
      fileName = (dot > 0 ? chosen.name.slice(0, dot) : chosen.name).replace(/[_-]/g, ' ');
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    processing = true;
    errors = {};
    message = '';

    const form = new FormData();
    append(form, 'fileName', fileName);
    append(form, 'file', file);
    append(form, 'directory', directory);
    append(form, 'tags', tags);
    append(form, 'departmentId', departmentId);

    const { error } = await actions.downloads.create(form);
    if (error) {
      const parsed = parseActionError(error);
      errors = parsed.fields;
      message = parsed.message;
      processing = false;
      return;
    }
    await navigate('/admin/downloads');
  }
</script>

<form method="post" onsubmit={submit} class="{cardClass} space-y-6 p-6">
  <div class="space-y-1.5">
    <span class="block text-sm font-semibold text-foreground">Select document file</span>
    <label for="file" class="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-strong px-4 text-center transition-colors hover:border-gold-500 hover:bg-gold-500/5">
      <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-600"><Upload class="h-6 w-6" aria-hidden="true" /></span>
      <span class="mb-1 text-sm font-medium"><span class="font-bold text-link">Click to choose a file</span> or drag and drop</span>
      <span class="text-xs text-muted-foreground">PDF, DOCX, XLSX, images, ZIP (max {maxMb} MB)</span>
    </label>
    <input id="file" type="file" required class="sr-only" onchange={onFile} aria-invalid={errors.file ? 'true' : undefined} />
    {#if file}
      <p class="flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-foreground">
        <Upload class="h-4 w-4 shrink-0" aria-hidden="true" /> Ready to upload: {file.name} ({formatFileSize(file.size)})
      </p>
    {/if}
    {#if errors.file}<p class="text-xs text-destructive" role="alert">{errors.file}</p>{/if}
  </div>

  <Field label="Display name" id="fileName" error={errors.fileName} required>
    <input id="fileName" type="text" required bind:value={fileName} class={inputClass} placeholder="e.g. Student Handbook 2026" />
  </Field>

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
    <Field label="Category / folder" id="directory" error={errors.directory} hint="Defaults to General.">
      <div class="relative">
        <Folder class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input id="directory" type="text" list="directory-list" bind:value={directory} class="{inputClass} pl-10" placeholder="e.g. Handbook, Enrollment" />
        <datalist id="directory-list">{#each directories as name (name)}<option value={name}></option>{/each}</datalist>
      </div>
    </Field>

    <Field label="Owning department" id="departmentId" error={errors.departmentId}>
      <select id="departmentId" bind:value={departmentId} class="{selectClass} w-full">
        {#if isSuperAdmin}<option value="">General (no specific department)</option>{/if}
        {#each departments as dept (dept.id)}<option value={String(dept.id)}>{dept.name}</option>{/each}
      </select>
    </Field>
  </div>

  <Field label="Tags (comma-separated)" id="tags" error={errors.tags}>
    <div class="relative">
      <Tag class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input id="tags" type="text" bind:value={tags} class="{inputClass} pl-10" placeholder="e.g. freshman, manual, 2026" />
    </div>
  </Field>

  <FormActions cancelHref="/admin/downloads" {processing} {message} submitLabel="Upload and publish" />
</form>
