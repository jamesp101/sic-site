<script lang="ts">
  import { actions } from 'astro:actions';
  import { toast } from 'svelte-sonner';
  import { reloadView } from '@/lib/navigation';
  import {
    Check, Copy, ExternalLink, File, FileArchive, FileImage, FileSpreadsheet, FileText, Folder, FolderPlus, HardDrive,
    Info, LayoutGrid, List, Loader2, RefreshCw, Search, Tag, Trash,
  } from '@lucide/svelte';
  import ConfirmDialog from '@/components/admin/ConfirmDialog.svelte';
  import { inputClass, parseActionError, primaryButtonClass, secondaryButtonClass } from '@/components/admin/shared/form-utils';
  import { cardClass, formatDate, searchInputClass, selectClass, thClass } from '@/components/admin/ui';
  import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
  import { Sheet, SheetContent } from '@/components/ui/sheet';
  import type { FileKind } from '@/lib/content-types';
  import { formatFileSize } from '@/lib/format';

  interface DownloadRow {
    id: number;
    fileName: string;
    url: string;
    size: number;
    extension: string;
    kind: FileKind;
    directory: string;
    tags: string[];
    departmentId: number | null;
    departmentName: string | null;
    createdAt: string;
  }
  interface FolderRow {
    name: string;
    count: number;
    id: number | null;
    canDelete: boolean;
    href: string;
  }
  /** The list state computed by the page (`runList`): this island only renders it, links do the navigating. */
  interface ListView {
    totalFiles: number;
    totalBytes: number;
    matching: number;
    q: string;
    folder: string;
    sort: string;
    dir: string;
    sorts: { label: string; field: string; href: string; active: boolean }[];
    allFoldersHref: string;
    resetHref: string;
    folders: FolderRow[];
  }

  let {
    downloads,
    departments,
    manager,
    isSuperAdmin,
  }: {
    downloads: DownloadRow[];
    departments: { id: number; name: string }[];
    manager: ListView;
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

  let viewMode = $state<'grid' | 'list'>('grid');
  let selected = $state<DownloadRow | null>(null);
  let detailsOpen = $state(false);
  let copied = $state(false);

  let folderOpen = $state(false);
  let folderName = $state('');
  let folderDept = $state('');
  let folderBusy = $state(false);
  let folderError = $state('');

  let confirmOpen = $state(false);
  let confirmBusy = $state(false);
  let pending = $state<{ kind: 'file' | 'folder'; id: number; name: string } | null>(null);

  const filtered = $derived(Boolean(manager.q || manager.folder));

  function openDetails(row: DownloadRow) {
    selected = row;
    detailsOpen = true;
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
      toast.error(parseActionError(error).message);
      return;
    }
    await reloadView();
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
    await reloadView();
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && detailsOpen && !confirmOpen) detailsOpen = false;
  }

  const chip = 'inline-flex items-center gap-1 rounded-md bg-surface-alt px-2 py-0.5 text-xs font-semibold text-muted-foreground';
  const sortLink = (active: boolean) => `font-medium hover:text-link ${active ? 'font-bold text-link' : ''}`;
  const iconBtn = 'inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';
</script>

<svelte:window onkeydown={onKeydown} />

<div class="space-y-6">
  <!-- Header actions -->
  <div class="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
    <p class="text-sm text-muted-foreground">
      <span class="font-semibold text-foreground">{manager.totalFiles} files</span> · {formatFileSize(manager.totalBytes)} stored
    </p>
    <div class="flex flex-wrap items-center gap-2 sm:gap-3">
      <div class="flex items-center rounded-lg border border-border-strong bg-surface-alt p-1" role="group" aria-label="View mode">
        <button type="button" onclick={() => (viewMode = 'grid')} aria-pressed={viewMode === 'grid'} class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold {viewMode === 'grid' ? 'bg-surface text-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}">
          <LayoutGrid class="h-3.5 w-3.5" aria-hidden="true" /> Grid
        </button>
        <button type="button" onclick={() => (viewMode = 'list')} aria-pressed={viewMode === 'list'} class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold {viewMode === 'list' ? 'bg-surface text-foreground shadow-brand-sm' : 'text-muted-foreground hover:text-foreground'}">
          <List class="h-3.5 w-3.5" aria-hidden="true" /> List
        </button>
      </div>
      <button type="button" onclick={() => (folderOpen = true)} class={secondaryButtonClass}>
        <FolderPlus class="h-4 w-4 text-gold-600" aria-hidden="true" /> New directory
      </button>
      <a href="/admin/downloads/create" class={primaryButtonClass}>Upload file</a>
    </div>
  </div>

  <!-- Filters -->
  <form method="get" action="/admin/downloads" class="flex flex-col items-center justify-between gap-3 md:flex-row">
    <div class="relative w-full md:max-w-md">
      <Search class="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" name="q" value={manager.q} placeholder="Search file name, directory, tags…" aria-label="Search files" class={searchInputClass} />
    </div>
    <input type="hidden" name="folder" value={manager.folder} disabled={!manager.folder} />
    <input type="hidden" name="sort" value={manager.sort} />
    <input type="hidden" name="dir" value={manager.dir} />
    <div class="flex w-full items-center gap-2 *:flex-1 md:w-auto md:*:flex-none">
      <button type="submit" class={primaryButtonClass}>Search</button>
      {#if filtered}
        <a href={manager.resetHref} class={secondaryButtonClass}><RefreshCw class="h-3 w-3" aria-hidden="true" /> Reset</a>
      {/if}
    </div>
  </form>

  <!-- Directories -->
  <section class="space-y-2" aria-label="Directories">
    <h2 class="font-sans text-xs font-bold tracking-wider text-muted-foreground uppercase">Directories</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      <a href={manager.allFoldersHref} aria-current={manager.folder === '' ? 'true' : undefined} class="flex items-center gap-3 rounded-xl border p-3 text-left transition-colors {manager.folder === '' ? 'border-gold-500 bg-gold-500/10' : 'border-border bg-surface hover:border-gold-400'}">
        <Folder class="h-5 w-5 shrink-0 text-gold-500" aria-hidden="true" />
        <span class="min-w-0"><span class="block truncate text-xs font-semibold">All files</span><span class="block text-xs text-muted-foreground">{manager.totalFiles} items</span></span>
      </a>
      {#each manager.folders as dir (dir.name)}
        <div class="group relative flex items-center justify-between rounded-xl border p-3 transition-colors {manager.folder === dir.name ? 'border-gold-500 bg-gold-500/10' : 'border-border bg-surface hover:border-gold-400'}">
          <a href={dir.href} aria-current={manager.folder === dir.name ? 'true' : undefined} class="flex min-w-0 flex-1 items-center gap-3 text-left">
            <Folder class="h-5 w-5 shrink-0 text-gold-500" aria-hidden="true" />
            <span class="min-w-0"><span class="block truncate text-xs font-semibold">{dir.name}</span><span class="block text-xs text-muted-foreground">{dir.count} items</span></span>
          </a>
          {#if dir.id && dir.canDelete}
            <button type="button" onclick={() => askDelete('folder', dir.id!, dir.name)} class="ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete directory ${dir.name}`}>
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
      <h2 class="font-sans text-xs font-bold tracking-wider text-muted-foreground uppercase">Files ({manager.matching})</h2>
      {#if downloads.length > 0}
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort:</span>
          {#each manager.sorts as s, i (s.field)}
            {#if i > 0}·{/if}
            <a href={s.href} class={sortLink(s.active)} aria-current={s.active ? 'true' : undefined}>{s.label}</a>
          {/each}
        </div>
      {/if}
    </div>

    {#if downloads.length === 0}
      <div class="{cardClass} flex flex-col items-center justify-center border-2 border-dashed p-12 text-center">
        <HardDrive class="mb-3 h-12 w-12 text-muted-foreground" aria-hidden="true" />
        {#if filtered}
          <h3 class="text-base font-semibold">No files found</h3>
          <p class="mt-1 max-w-sm text-xs text-muted-foreground">No files match your filters. Clear them to see every file.</p>
          <a href={manager.resetHref} class="{secondaryButtonClass} mt-4">Clear filters</a>
        {:else}
          <h3 class="text-base font-semibold">No files yet</h3>
          <p class="mt-1 max-w-sm text-xs text-muted-foreground">Upload a form, manual or resource to publish it on the downloads page.</p>
          <a href="/admin/downloads/create" class="{primaryButtonClass} mt-4">Upload file</a>
        {/if}
      </div>
    {:else if viewMode === 'grid'}
      <ul class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {#each downloads as d (d.id)}
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
                <span class={chip}><Folder class="h-3 w-3 text-gold-500" aria-hidden="true" /> {d.directory}</span>
                <span class="max-w-[120px] truncate text-xs font-semibold text-link">{d.departmentName ?? 'General'}</span>
              </div>
              {#if d.tags.length > 0}
                <div class="flex flex-wrap gap-1">{#each d.tags.slice(0, 3) as tag (tag)}<span class={chip}><Tag class="h-2.5 w-2.5" aria-hidden="true" /> {tag}</span>{/each}</div>
              {/if}
            </div>
            <div class="flex items-center justify-between border-t border-border pt-2 text-xs">
              <span class="text-xs text-muted-foreground">{formatDate(d.createdAt)}</span>
              <div class="flex items-center gap-2">
                <button type="button" onclick={() => openDetails(d)} class={iconBtn} aria-label={`Details for ${d.fileName}`}><Info class="h-4 w-4" aria-hidden="true" /></button>
                <a href={d.url} target="_blank" rel="noopener" class={iconBtn} aria-label={`Open ${d.fileName}`}><ExternalLink class="h-4 w-4" aria-hidden="true" /></a>
                <button type="button" onclick={() => askDelete('file', d.id, d.fileName)} class="{iconBtn} hover:!bg-destructive/10 hover:!text-destructive" aria-label={`Delete ${d.fileName}`}><Trash class="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="{cardClass} overflow-x-auto" tabindex="0" role="region" aria-label="Files table">
        <table class="w-full min-w-3xl border-collapse text-left">
          <thead>
            <tr class="border-b border-border bg-surface-alt">
              <th scope="col" class={thClass}>Name</th>
              <th scope="col" class={thClass}>Directory</th>
              <th scope="col" class={thClass}>Department</th>
              <th scope="col" class={thClass}>Size</th>
              <th scope="col" class={thClass}>Uploaded</th>
              <th scope="col" class="{thClass} text-right">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border text-sm">
            {#each downloads as d (d.id)}
              {@const Icon = kindIcon[d.kind]}
              <tr class="hover:bg-surface-alt">
                <td class="px-4 py-3">
                  <div class="flex items-center gap-3">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg {kindClass[d.kind]}"><Icon class="h-4 w-4" aria-hidden="true" /></div>
                    <div class="min-w-0">
                      <a href={d.url} target="_blank" rel="noopener" class="block max-w-xs truncate font-bold text-foreground hover:text-link" title={d.fileName}>{d.fileName}</a>
                      {#if d.tags.length > 0}<div class="mt-0.5 flex flex-wrap gap-1">{#each d.tags as tag (tag)}<span class="text-xs text-muted-foreground">#{tag}</span>{/each}</div>{/if}
                    </div>
                  </div>
                </td>
                <td class="px-4 py-3 text-xs font-semibold">{d.directory}</td>
                <td class="px-4 py-3 text-xs font-semibold text-link">{d.departmentName ?? 'General'}</td>
                <td class="px-4 py-3 font-mono text-xs">{formatFileSize(d.size)}</td>
                <td class="px-4 py-3 text-xs text-muted-foreground">{formatDate(d.createdAt)}</td>
                <td class="px-4 py-3">
                  <div class="flex items-center justify-end gap-2">
                    <button type="button" onclick={() => openDetails(d)} class={iconBtn} aria-label={`Details for ${d.fileName}`}><Info class="h-4 w-4" aria-hidden="true" /></button>
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

<!-- New directory -->
<Dialog bind:open={folderOpen}>
  <DialogContent class="max-w-md border-border bg-surface shadow-brand-xl">
    <form method="post" onsubmit={createFolder} class="space-y-4">
      <DialogTitle>New directory</DialogTitle>
      <div class="space-y-1.5">
        <label for="folder_name" class="block text-sm font-semibold">Directory name</label>
        <input id="folder_name" type="text" required maxlength="255" bind:value={folderName} placeholder="e.g. Student handbooks" class="{inputClass} w-full" />
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
          {#if folderBusy}<Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />{/if} Create directory
        </button>
      </div>
    </form>
  </DialogContent>
</Dialog>

<ConfirmDialog
  bind:open={confirmOpen}
  title={pending?.kind === 'folder' ? `Delete directory “${pending.name}”?` : `Delete “${pending?.name ?? ''}”?`}
  description={pending?.kind === 'folder' ? 'Files in this directory are kept.' : 'The file will be permanently removed. This cannot be undone.'}
  confirmLabel="Delete"
  destructive
  processing={confirmBusy}
  onConfirm={confirmDelete}
/>

<!-- File details drawer -->
<Sheet bind:open={detailsOpen}>
  <SheetContent label="File details" class="w-full justify-between gap-0 border-l border-border bg-surface shadow-brand-xl sm:max-w-md">
    {#if selected}
      {@const d = selected}
      {@const Icon = kindIcon[d.kind]}
      <div class="space-y-6">
        <div class="border-b border-border pb-4 pr-8">
          <h2 class="font-serif text-lg font-bold">File details</h2>
        </div>
        <div class="flex flex-col items-center space-y-3 rounded-2xl p-8 text-center {kindClass[d.kind]}">
          <Icon class="h-10 w-10" aria-hidden="true" />
          <div>
            <p class="line-clamp-2 text-base font-bold">{d.fileName}</p>
            <span class="font-mono text-xs">{formatFileSize(d.size)}{d.extension ? ` · ${d.extension.toUpperCase()}` : ''}</span>
          </div>
        </div>
        <dl class="space-y-3 text-xs">
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Directory</dt><dd class="font-semibold">{d.directory}</dd></div>
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Department</dt><dd class="font-semibold text-link">{d.departmentName ?? 'General'}</dd></div>
          <div class="flex justify-between border-b border-border py-2"><dt class="text-muted-foreground">Uploaded</dt><dd class="font-mono">{formatDate(d.createdAt, true)}</dd></div>
          {#if d.tags.length > 0}
            <div class="space-y-1.5 border-b border-border py-2"><dt class="text-muted-foreground">Tags</dt><dd class="flex flex-wrap gap-1">{#each d.tags as tag (tag)}<span class={chip}><Tag class="h-3 w-3" aria-hidden="true" /> {tag}</span>{/each}</dd></div>
          {/if}
        </dl>
        <div class="space-y-1.5">
          <label for="direct-url" class="block text-xs font-semibold text-muted-foreground">Direct access URL</label>
          <div class="flex items-center gap-2">
            <input id="direct-url" type="text" readonly value={typeof window === 'undefined' ? d.url : window.location.origin + d.url} class="w-full rounded-lg border border-input-border bg-surface-alt px-3 py-1.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="button" onclick={() => copyLink(d.url)} class="{primaryButtonClass} shrink-0 !px-3 !py-1.5 text-xs">
              {#if copied}<Check class="h-3.5 w-3.5" aria-hidden="true" /> Copied{:else}<Copy class="h-3.5 w-3.5" aria-hidden="true" /> Copy{/if}
            </button>
          </div>
          <p class="sr-only" role="status">{copied ? 'Link copied' : ''}</p>
        </div>
      </div>
      <div class="flex items-center justify-between border-t border-border pt-6">
        <button type="button" onclick={() => askDelete('file', d.id, d.fileName)} class="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20">
          <Trash class="h-4 w-4" aria-hidden="true" /> Delete file
        </button>
        <a href={d.url} target="_blank" rel="noopener" class={primaryButtonClass}><ExternalLink class="h-4 w-4" aria-hidden="true" /> Open file</a>
      </div>
    {/if}
  </SheetContent>
</Sheet>
