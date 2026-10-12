<script lang="ts">
  import { actions } from 'astro:actions';
  import {
    Check, Copy, ExternalLink, File, FileArchive, FileImage, FileSpreadsheet, FileText, Folder, FolderPlus, HardDrive,
    Info, LayoutGrid, List, Loader2, RefreshCw, Search, Tag, Trash, X,
  } from '@lucide/svelte';
  import ConfirmDialog from '@/components/admin/ConfirmDialog.svelte';
  import { parseActionError, primaryButtonClass, secondaryButtonClass } from '@/components/admin/shared/form-utils';
  import { cardClass, formatDate, selectClass } from '@/components/admin/ui';
  import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
  import type { FileKind } from '@/lib/content-types';
  import { formatFileSize } from '@/lib/format';

  interface DownloadRow {
    id: number;
    fileName: string;
    url: string;
    size: number;
    extension: string;
    kind: FileKind;
    directory: string | null;
    tags: string[];
    departmentId: number | null;
    departmentName: string | null;
    createdAt: string;
  }
  interface DirectoryRow {
    id: number;
    name: string;
    canDelete: boolean;
  }

  let {
    downloads,
    departments,
    directories,
    isSuperAdmin,
  }: {
    downloads: DownloadRow[];
    departments: { id: number; name: string }[];
    directories: DirectoryRow[];
    isSuperAdmin: boolean;
  } = $props();

  const kindClass: Record<FileKind, string> = {
    pdf: 'bg-file-pdf-bg text-file-pdf-fg',
    doc: 'bg-file-doc-bg text-file-doc-fg',
    sheet: 'bg-file-sheet-bg text-file-sheet-fg',
    image: 'bg-file-image-bg text-file-image-fg',
    archive: 'bg-file-archive-bg text-file-archive-fg',
    other: 'bg-file-other-bg text-file-other-fg',
  };
  const kindIcon = { pdf: FileText, doc: FileText, sheet: FileSpreadsheet, image: FileImage, archive: FileArchive, other: File } as const;

  type SortField = 'fileName' | 'createdAt' | 'size';

  let viewMode = $state<'grid' | 'list'>('grid');
  let search = $state('');
  let filterDept = $state('');
  let filterDir = $state('');
  let sortField = $state<SortField>('createdAt');
  let sortDesc = $state(true);
  let selected = $state<DownloadRow | null>(null);
  let copied = $state(false);

  let folderOpen = $state(false);
  let folderName = $state('');
  let folderDept = $state('');
  let folderBusy = $state(false);
  let folderError = $state('');

  let confirmOpen = $state(false);
  let confirmBusy = $state(false);
  let pending = $state<{ kind: 'file' | 'folder'; id: number; name: string } | null>(null);

  const totalBytes = $derived(downloads.reduce((sum, d) => sum + d.size, 0));

  const folders = $derived.by(() => {
    const map = new Map<string, { count: number; id?: number; canDelete: boolean }>();
    for (const dir of directories) map.set(dir.name, { count: 0, id: dir.id, canDelete: dir.canDelete });
    for (const d of downloads) {
      const name = d.directory || 'Uncategorized';
      const existing = map.get(name) ?? { count: 0, canDelete: false };
      map.set(name, { ...existing, count: existing.count + 1 });
    }
    return [...map.entries()].map(([name, info]) => ({ name, ...info }));
  });

  const visible = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const rows = downloads.filter((d) => {
      if (q && !(d.fileName.toLowerCase().includes(q) || d.directory?.toLowerCase().includes(q) || d.tags.some((t) => t.toLowerCase().includes(q)))) return false;
      if (filterDept && String(d.departmentId) !== filterDept) return false;
      if (filterDir === 'Uncategorized') return !d.directory;
      if (filterDir && d.directory !== filterDir) return false;
      return true;
    });
    const dir = sortDesc ? -1 : 1;
    return rows.sort((a, b) => {
      if (sortField === 'fileName') return dir * a.fileName.localeCompare(b.fileName);
      if (sortField === 'size') return dir * (a.size - b.size);
      return dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt));
    });
  });

  function toggleSort(field: SortField) {
    if (sortField === field) sortDesc = !sortDesc;
    else {
      sortField = field;
      sortDesc = true;
    }
  }

  function resetFilters() {
    search = '';
    filterDept = '';
    filterDir = '';
    sortField = 'createdAt';
    sortDesc = true;
  }

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(window.location.origin + url);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function askDelete(kind: 'file' | 'folder', id: number, name: string) {
    pending = { kind, id, name };
    confirmOpen = true;
  }

  async function confirmDelete() {
    if (!pending) return;
    confirmBusy = true;
    const { error } = await (pending.kind === 'file'
      ? actions.downloads.delete({ id: pending.id })
      : actions.directories.delete({ id: pending.id }));
    if (error) {
      confirmBusy = false;
      confirmOpen = false;
      alert(parseActionError(error).message);
      return;
    }
    window.location.reload();
  }

  async function createFolder(event: SubmitEvent) {
    event.preventDefault();
    folderBusy = true;
    folderError = '';
    const { error } = await actions.directories.create({
      name: folderName.trim(),
      departmentId: folderDept ? Number(folderDept) : null,
    });
    if (error) {
      const parsed = parseActionError(error);
      folderError = parsed.fields.name || parsed.message;
      folderBusy = false;
      return;
    }
    window.location.reload();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selected && !confirmOpen) selected = null;
  }

  const chip = 'inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-0.5 text-xs font-semibold text-muted-foreground';
  const sortBtn = (field: SortField) =>
    `font-medium hover:text-link ${sortField === field ? 'font-bold text-link' : ''}`;
  const iconBtn = 'rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
</script>

<svelte:window onkeydown={onKeydown} />

<div class="space-y-6">
  <!-- Header actions -->
  <div class="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
    <p class="text-sm text-muted-foreground">
      <span class="font-semibold text-foreground">{downloads.length} files</span> · {formatFileSize(totalBytes)} stored
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center rounded-lg border border-border-strong bg-surface-alt p-1" role="group" aria-label="View mode">
        <button type="button" onclick={() => (viewMode = 'grid')} aria-pressed={viewMode === 'grid'} class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold {viewMode === 'grid' ? 'bg-surface text-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}">
          <LayoutGrid class="h-3.5 w-3.5" aria-hidden="true" /> Grid
        </button>
        <button type="button" onclick={() => (viewMode = 'list')} aria-pressed={viewMode === 'list'} class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold {viewMode === 'list' ? 'bg-surface text-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}">
          <List class="h-3.5 w-3.5" aria-hidden="true" /> List
        </button>
      </div>
      <button type="button" onclick={() => (folderOpen = true)} class={secondaryButtonClass}>
        <FolderPlus class="h-4 w-4 text-gold-600" aria-hidden="true" /> New folder
      </button>
      <a href="/admin/downloads/create" class={primaryButtonClass}>Upload file</a>
    </div>
  </div>

  <!-- Filters -->
  <div class="flex flex-col items-center justify-between gap-3 md:flex-row">
    <div class="relative w-full md:max-w-md">
      <Search class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" placeholder="Search filename, category, tags…" aria-label="Search files" bind:value={search} class="w-full rounded-lg border border-border-strong bg-surface py-2 pr-4 pl-10 text-sm shadow-brand-sm outline-none focus:border-brand-600" />
    </div>
    <div class="flex w-full flex-wrap items-center justify-end gap-2.5 md:w-auto">
      <select bind:value={filterDept} aria-label="Filter by department" class={selectClass}>
        <option value="">All departments</option>
        {#each departments as dept (dept.id)}<option value={String(dept.id)}>{dept.name}</option>{/each}
      </select>
      <select bind:value={filterDir} aria-label="Filter by category" class={selectClass}>
        <option value="">All categories</option>
        {#each folders as dir (dir.name)}<option value={dir.name}>{dir.name} ({dir.count})</option>{/each}
      </select>
      <button type="button" onclick={resetFilters} class={secondaryButtonClass}><RefreshCw class="h-3 w-3" aria-hidden="true" /> Reset</button>
    </div>
  </div>

  <!-- Folders -->
  <section class="space-y-2" aria-label="Folders">
    <h2 class="font-sans text-xs font-bold tracking-wider text-muted-foreground uppercase">Folders</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <button type="button" onclick={() => (filterDir = '')} aria-pressed={filterDir === ''} class="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors {filterDir === '' ? 'border-gold-500 bg-gold-500/10' : 'border-border bg-surface hover:border-gold-400'}">
        <Folder class="h-5 w-5 shrink-0 text-gold-500" aria-hidden="true" />
        <span class="min-w-0"><span class="block truncate text-xs font-semibold">All files</span><span class="block text-xs text-muted-foreground">{downloads.length} items</span></span>
      </button>
      {#each folders as dir (dir.name)}
        <div class="group relative flex items-center justify-between rounded-xl border p-3 transition-colors {filterDir === dir.name ? 'border-gold-500 bg-gold-500/10' : 'border-border bg-surface hover:border-gold-400'}">
          <button type="button" onclick={() => (filterDir = dir.name)} aria-pressed={filterDir === dir.name} class="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Folder class="h-5 w-5 shrink-0 text-gold-500" aria-hidden="true" />
            <span class="min-w-0"><span class="block truncate text-xs font-semibold">{dir.name}</span><span class="block text-xs text-muted-foreground">{dir.count} items</span></span>
          </button>
          {#if dir.id && dir.canDelete}
            <button type="button" onclick={() => askDelete('folder', dir.id!, dir.name)} class="ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete folder ${dir.name}`}>
              <Trash class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Files -->
  <section class="space-y-3" aria-label="Files">
    <div class="flex items-center justify-between">
      <h2 class="font-sans text-xs font-bold tracking-wider text-muted-foreground uppercase">Files ({visible.length})</h2>
      {#if visible.length > 0}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          <button type="button" onclick={() => toggleSort('fileName')} class={sortBtn('fileName')}>Name</button>·
          <button type="button" onclick={() => toggleSort('createdAt')} class={sortBtn('createdAt')}>Date</button>·
          <button type="button" onclick={() => toggleSort('size')} class={sortBtn('size')}>Size</button>
        </div>
      {/if}
    </div>

    {#if visible.length === 0}
      <div class="{cardClass} flex flex-col items-center justify-center border-2 border-dashed p-12 text-center">
        <HardDrive class="mb-3 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        <h3 class="text-base font-semibold">No documents found</h3>
        <p class="mt-1 max-w-sm text-xs text-muted-foreground">No files match your filters. Clear them or upload a new file.</p>
        <button type="button" onclick={resetFilters} class="{secondaryButtonClass} mt-4">Clear filters</button>
      </div>
    {:else if viewMode === 'grid'}
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each visible as d (d.id)}
          {@const Icon = kindIcon[d.kind]}
          <li class="{cardClass} flex flex-col justify-between p-4 transition-shadow hover:shadow-brand-md">
            <div class="flex items-center gap-3 overflow-hidden">
              <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl {kindClass[d.kind]}"><Icon class="h-5 w-5" aria-hidden="true" /></div>
              <div class="min-w-0">
                <a href={d.url} target="_blank" rel="noopener" class="block truncate text-sm font-bold text-foreground hover:text-link" title={d.fileName}>{d.fileName}</a>
                <span class="mt-0.5 block font-mono text-xs text-muted-foreground">{formatFileSize(d.size)}</span>
              </div>
            </div>
            <div class="my-3 space-y-2 border-t border-border pt-2">
              <div class="flex items-center justify-between text-xs">
                {#if d.directory}<span class={chip}><Folder class="h-3 w-3 text-gold-500" aria-hidden="true" /> {d.directory}</span>{:else}<span class="text-xs text-muted-foreground italic">Root</span>{/if}
                <span class="max-w-[120px] truncate text-xs font-semibold text-link">{d.departmentName ?? 'General'}</span>
              </div>
              {#if d.tags.length > 0}
                <div class="flex flex-wrap gap-1">{#each d.tags.slice(0, 3) as tag (tag)}<span class={chip}><Tag class="h-2.5 w-2.5" aria-hidden="true" /> {tag}</span>{/each}</div>
              {/if}
            </div>
            <div class="flex items-center justify-between border-t border-border pt-2 text-xs">
              <span class="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
              <div class="flex items-center gap-1">
                <button type="button" onclick={() => (selected = d)} class={iconBtn} aria-label={`Details for ${d.fileName}`}><Info class="h-4 w-4" aria-hidden="true" /></button>
                <a href={d.url} target="_blank" rel="noopener" class={iconBtn} aria-label={`Open ${d.fileName}`}><ExternalLink class="h-4 w-4" aria-hidden="true" /></a>
                <button type="button" onclick={() => askDelete('file', d.id, d.fileName)} class="{iconBtn} hover:!bg-destructive/10 hover:!text-destructive" aria-label={`Delete ${d.fileName}`}><Trash class="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="{cardClass} overflow-x-auto">
        <table class="w-full border-collapse text-left">
          <thead>
            <tr class="border-b border-border bg-surface-alt text-xs font-bold text-muted-foreground">
              <th scope="col" class="px-6 py-3.5">Name</th>
              <th scope="col" class="px-6 py-3.5">Category</th>
              <th scope="col" class="px-6 py-3.5">Department</th>
              <th scope="col" class="px-6 py-3.5">Size</th>
              <th scope="col" class="px-6 py-3.5">Uploaded</th>
              <th scope="col" class="px-6 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border text-sm">
            {#each visible as d (d.id)}
              {@const Icon = kindIcon[d.kind]}
              <tr class="hover:bg-surface-alt">
                <td class="px-6 py-3.5">
                  <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {kindClass[d.kind]}"><Icon class="h-4 w-4" aria-hidden="true" /></div>
                    <div>
                      <a href={d.url} target="_blank" rel="noopener" class="font-bold text-foreground hover:text-link">{d.fileName}</a>
                      {#if d.tags.length > 0}<div class="mt-0.5 flex flex-wrap gap-1">{#each d.tags as tag (tag)}<span class="text-xs text-muted-foreground">#{tag}</span>{/each}</div>{/if}
                    </div>
                  </div>
                </td>
                <td class="px-6 py-3.5 text-xs font-semibold">{d.directory ?? 'Root'}</td>
                <td class="px-6 py-3.5 text-xs font-semibold text-link">{d.departmentName ?? 'General'}</td>
                <td class="px-6 py-3.5 font-mono text-xs">{formatFileSize(d.size)}</td>
                <td class="px-6 py-3.5 text-xs text-muted-foreground">{formatDate(d.createdAt)}</td>
                <td class="px-6 py-3.5">
                  <div class="flex items-center justify-end gap-1">
                    <button type="button" onclick={() => (selected = d)} class={iconBtn} aria-label={`Details for ${d.fileName}`}><Info class="h-4 w-4" aria-hidden="true" /></button>
                    <a href={d.url} target="_blank" rel="noopener" class={iconBtn} aria-label={`Open ${d.fileName}`}><ExternalLink class="h-4 w-4" aria-hidden="true" /></a>
                    <button type="button" onclick={() => askDelete('file', d.id, d.fileName)} class="{iconBtn} hover:!bg-destructive/10 hover:!text-destructive" aria-label={`Delete ${d.fileName}`}><Trash class="h-4 w-4" aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>

<!-- New folder -->
<Dialog bind:open={folderOpen}>
  <DialogContent class="max-w-md border-border bg-surface shadow-brand-xl">
    <form onsubmit={createFolder} class="space-y-4">
      <DialogTitle>New folder</DialogTitle>
      <div class="space-y-1.5">
        <label for="folder_name" class="block text-sm font-semibold">Folder name</label>
        <input id="folder_name" type="text" required maxlength="255" bind:value={folderName} placeholder="e.g. Student handbooks" class="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm outline-none focus:border-brand-600" />
      </div>
      <div class="space-y-1.5">
        <label for="folder_dept" class="block text-sm font-semibold">Owning department</label>
        <select id="folder_dept" bind:value={folderDept} class="{selectClass} w-full">
          {#if isSuperAdmin}<option value="">General (all departments)</option>{/if}
          {#each departments as dept (dept.id)}<option value={String(dept.id)}>{dept.name}</option>{/each}
        </select>
      </div>
      {#if folderError}<p class="text-xs text-destructive" role="alert">{folderError}</p>{/if}
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" onclick={() => (folderOpen = false)} class={secondaryButtonClass}>Cancel</button>
        <button type="submit" disabled={folderBusy} class={primaryButtonClass}>
          {#if folderBusy}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{/if} Create folder
        </button>
      </div>
    </form>
  </DialogContent>
</Dialog>

<ConfirmDialog
  bind:open={confirmOpen}
  title={pending?.kind === 'folder' ? `Delete folder “${pending.name}”?` : `Delete “${pending?.name ?? ''}”?`}
  description={pending?.kind === 'folder' ? 'Files in this folder are kept.' : 'The file will be permanently removed. This cannot be undone.'}
  confirmLabel="Delete"
  destructive
  processing={confirmBusy}
  onConfirm={confirmDelete}
/>

<!-- File details drawer -->
{#if selected}
  {@const d = selected}
  {@const Icon = kindIcon[d.kind]}
  <div class="fixed inset-0 z-50 flex justify-end">
    <button type="button" class="fixed inset-0 bg-black/50" aria-label="Close details" onclick={() => (selected = null)}></button>
    <div role="dialog" aria-modal="true" aria-label="File details" class="relative z-10 flex h-full w-full max-w-md flex-col justify-between overflow-y-auto border-l border-border bg-surface p-6 shadow-brand-xl">
      <div class="space-y-6">
        <div class="flex items-center justify-between border-b border-border pb-4">
          <h2 class="font-serif text-lg font-bold">File details</h2>
          <button type="button" onclick={() => (selected = null)} class={iconBtn} aria-label="Close"><X class="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div class="flex flex-col items-center space-y-3 rounded-2xl p-8 text-center {kindClass[d.kind]}">
          <Icon class="h-10 w-10" aria-hidden="true" />
          <div>
            <p class="line-clamp-2 text-base font-bold">{d.fileName}</p>
            <span class="font-mono text-xs">{formatFileSize(d.size)}{d.extension ? ` · ${d.extension.toUpperCase()}` : ''}</span>
          </div>
        </div>
        <dl class="space-y-3 text-xs">
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Folder</dt><dd class="font-semibold">{d.directory ?? 'Root / General'}</dd></div>
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Department</dt><dd class="font-semibold text-link">{d.departmentName ?? 'General public'}</dd></div>
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Uploaded</dt><dd class="font-mono">{formatDate(d.createdAt, true)}</dd></div>
          {#if d.tags.length > 0}
            <div class="space-y-1.5 border-b border-border py-2"><dt class="text-muted-foreground">Tags</dt><dd class="flex flex-wrap gap-1">{#each d.tags as tag (tag)}<span class={chip}><Tag class="h-3 w-3" aria-hidden="true" /> {tag}</span>{/each}</dd></div>
          {/if}
        </dl>
        <div class="space-y-1.5">
          <label for="direct-url" class="block text-xs font-semibold text-muted-foreground">Direct access URL</label>
          <div class="flex items-center gap-2">
            <input id="direct-url" type="text" readonly value={typeof window === 'undefined' ? d.url : window.location.origin + d.url} class="w-full rounded-lg border border-border-strong bg-surface-alt px-3 py-1.5 font-mono text-xs outline-none" />
            <button type="button" onclick={() => copyLink(d.url)} class="{primaryButtonClass} shrink-0 !px-3 !py-1.5 text-xs">
              {#if copied}<Check class="h-3.5 w-3.5" aria-hidden="true" /> Copied{:else}<Copy class="h-3.5 w-3.5" aria-hidden="true" /> Copy{/if}
            </button>
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-border pt-6">
        <button type="button" onclick={() => askDelete('file', d.id, d.fileName)} class="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20">
          <Trash class="h-4 w-4" aria-hidden="true" /> Delete file
        </button>
        <a href={d.url} target="_blank" rel="noopener" class={primaryButtonClass}><ExternalLink class="h-4 w-4" aria-hidden="true" /> Open file</a>
      </div>
    </div>
  </div>
{/if}
