<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import { Folder, Tag, Upload } from '@lucide/svelte';
  import { actionForm } from '@/components/admin/shared/action-form.svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import { append, formatFileSize, inputClass } from '@/components/admin/shared/form-utils';
  import { uploadDownloadDirect } from '@/components/admin/editor/upload';
  import { cardClass, selectClass } from '@/components/admin/ui';

  let {
    departments,
    directories,
    defaultDirectory,
    isSuperAdmin,
    defaultDepartmentId = null,
    maxMb = 20,
    uploadMode = 'multipart',
  }: {
    departments: { id: number; name: string }[];
    directories: string[];
    /** Directory a Download without one is stored in. */
    defaultDirectory: string;
    isSuperAdmin: boolean;
    /** Admin scope's department, preselected (superadmins may change it). */
    defaultDepartmentId?: number | null;
    maxMb?: number;
    /** `direct`: upload from the browser to the bucket, then submit only the key; `multipart`: submit the file. */
    uploadMode?: 'direct' | 'multipart';
  } = $props();

  let file = $state<File | null>(null);
  let fileName = $state('');
  let directory = $state('');
  let tags = $state('');
  let departmentId = $state(isSuperAdmin ? String(untrack(() => defaultDepartmentId) ?? '') : String(departments[0]?.id ?? ''));
  let progress = $state<number | null>(null);
  /** Already uploaded file, reused when the form is resubmitted after a validation error. */
  let uploaded: { file: File; key: string } | null = null;

  function onFile(event: Event) {
    const chosen = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    file = chosen;
    if (chosen && !fileName) {
      const dot = chosen.name.lastIndexOf('.');
      fileName = (dot > 0 ? chosen.name.slice(0, dot) : chosen.name).replace(/[_-]/g, ' ');
    }
  }

  const form = actionForm({
    async run() {
      const data = new FormData();
      append(data, 'fileName', fileName);
      if (uploadMode === 'direct' && file) {
        if (file.size > maxMb * 1024 * 1024) return { failure: { fields: { file: `The file must not be larger than ${maxMb} MB.` } } };
        try {
          if (uploaded?.file !== file) uploaded = { file, key: await uploadDownloadDirect(file, (percent) => (progress = percent)) };
        } catch (error) {
          progress = null;
          return { failure: { message: error instanceof Error ? error.message : 'The upload failed.' } };
        }
        append(data, 'uploadedKey', uploaded.key);
      } else {
        append(data, 'file', file);
      }
      append(data, 'directoryName', directory);
      append(data, 'tags', tags);
      append(data, 'departmentId', departmentId);

      const result = await actions.downloads.create(data);
      progress = null;
      return result;
    },
    onSuccess: () => navigate('/admin/downloads'),
  });
</script>

<form method="post" onsubmit={form.submit} class="{cardClass} space-y-6 p-6">
  <div class="space-y-1.5">
    <span class="block text-sm font-semibold text-foreground">Select document file</span>
    <label for="file" class="flex h-40 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border-strong px-4 text-center transition-colors hover:border-gold-500 hover:bg-gold-500/5">
      <span class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-500/10 text-gold-600"><Upload class="h-6 w-6" aria-hidden="true" /></span>
      <span class="mb-1 text-sm font-medium"><span class="font-bold text-link">Click to choose a file</span> or drag and drop</span>
      <span class="text-xs text-muted-foreground">PDF, DOCX, XLSX, images, ZIP (max {maxMb} MB)</span>
    </label>
    <input id="file" type="file" required class="sr-only" onchange={onFile} aria-invalid={form.errors.file ? 'true' : undefined} aria-describedby={form.errors.file ? 'file-error' : undefined} />
    {#if file}
      <p class="flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-xs font-semibold text-foreground">
        <Upload class="h-4 w-4 shrink-0" aria-hidden="true" /> Ready to upload: {file.name} ({formatFileSize(file.size)})
      </p>
    {/if}
    {#if progress !== null}
      <p class="text-xs font-semibold text-muted-foreground" role="status">Uploading… {progress}%</p>
    {/if}
    {#if form.errors.file}<p id="file-error" class="text-xs text-destructive" role="alert">{form.errors.file}</p>{/if}
  </div>

  <Field label="Display name" id="fileName" error={form.errors.fileName} required>
    {#snippet children(props)}
      <input {...props} type="text" required bind:value={fileName} class={inputClass} placeholder="e.g. Student Handbook 2026" />
    {/snippet}
  </Field>

  <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
    <Field label="Directory" id="directory" error={form.errors.directoryName} hint={`Defaults to ${defaultDirectory}.`}>
      {#snippet children(props)}
        <div class="relative">
          <Folder class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input {...props} type="text" list="directory-list" bind:value={directory} class="{inputClass} pl-10" placeholder="e.g. Handbook, Enrollment" />
          <datalist id="directory-list">{#each directories as name (name)}<option value={name}></option>{/each}</datalist>
        </div>
      {/snippet}
    </Field>

    <Field label="Owning department" id="departmentId" error={form.errors.departmentId}>
      {#snippet children(props)}
        <select {...props} bind:value={departmentId} class="{selectClass} w-full">
          {#if isSuperAdmin}<option value="">General (no specific department)</option>{/if}
          {#each departments as dept (dept.id)}<option value={String(dept.id)}>{dept.name}</option>{/each}
        </select>
      {/snippet}
    </Field>
  </div>

  <Field label="Tags (comma-separated)" id="tags" error={form.errors.tags}>
    {#snippet children(props)}
      <div class="relative">
        <Tag class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input {...props} type="text" bind:value={tags} class="{inputClass} pl-10" placeholder="e.g. freshman, manual, 2026" />
      </div>
    {/snippet}
  </Field>

  <FormActions cancelHref="/admin/downloads" processing={form.processing} message={form.message} submitLabel="Upload and publish" />
</form>
