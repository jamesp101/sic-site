<script lang="ts">
  import { actions } from 'astro:actions';
  import { navigate } from 'astro:transitions/client';
  import { untrack } from 'svelte';
  import { Folder, Tag, Upload } from '@lucide/svelte';
  import Field from '@/components/admin/shared/Field.svelte';
  import FormActions from '@/components/admin/shared/FormActions.svelte';
  import { append, formatFileSize, inputClass, parseActionError } from '@/components/admin/shared/form-utils';
  import { cardClass, selectClass } from '@/components/admin/ui';

  let {
    departments,
    directories,
    isSuperAdmin,
    defaultDepartmentId = null,
    maxMb = 20,
    directUpload = false,
  }: {
    departments: { id: number; name: string }[];
    directories: string[];
    isSuperAdmin: boolean;
    /** Admin scope's department, preselected (superadmins may change it). */
    defaultDepartmentId?: number | null;
    maxMb?: number;
    /** True when the server stores files in S3: upload from the browser, then submit only the key. */
    directUpload?: boolean;
  } = $props();

  let file = $state<File | null>(null);
  let fileName = $state('');
  let directory = $state('');
  let tags = $state('');
  let departmentId = $state(isSuperAdmin ? String(untrack(() => defaultDepartmentId) ?? '') : String(departments[0]?.id ?? ''));
  let processing = $state(false);
  let errors = $state<Record<string, string>>({});
  let message = $state('');
  let progress = $state<number | null>(null);
  /** Already uploaded file, reused when the form is resubmitted after a validation error. */
  let uploaded: { file: File; key: string } | null = null;

  /** Uploads straight to the S3 bucket (request bodies over ~4.5 MB never reach the server) and returns the key. */
  async function uploadDirect(chosen: File): Promise<string> {
    const contentType = chosen.type || 'application/octet-stream';
    const issued = await fetch('/api/admin/uploads/direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: chosen.name, contentType, size: chosen.size }),
    });
    const grant = (await issued.json().catch(() => null)) as { key: string; url: string; message?: string } | null;
    if (!issued.ok || !grant?.key) throw new Error(grant?.message ?? 'Could not start the upload.');
    // XHR rather than fetch: only XHR reports upload progress.
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', grant.url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress = Math.round((event.loaded / event.total) * 100);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`The upload failed (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error('The upload failed. Check your connection and try again.'));
    xhr.send(chosen);
    await promise;
    return grant.key;
  }

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
    if (directUpload && file) {
      if (file.size > maxMb * 1024 * 1024) {
        errors = { file: `The file must not be larger than ${maxMb} MB.` };
        processing = false;
        return;
      }
      try {
        if (uploaded?.file !== file) uploaded = { file, key: await uploadDirect(file) };
        append(form, 'uploadedKey', uploaded.key);
      } catch (error) {
        message = error instanceof Error ? error.message : 'The upload failed.';
        processing = false;
        progress = null;
        return;
      }
    } else {
      append(form, 'file', file);
    }
    append(form, 'directory', directory);
    append(form, 'tags', tags);
    append(form, 'departmentId', departmentId);

    const { error } = await actions.downloads.create(form);
    progress = null;
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
    {#if progress !== null}
      <p class="text-xs font-semibold text-muted-foreground" role="status">Uploading… {progress}%</p>
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
