/**
 * Download manager session: the confirm-delete flow for a Download or a Directory and the New directory dialog.
 * Plain TypeScript (no runes, no DOM, no `astro:*`): the island renders `snapshot()` and calls the methods, the
 * real port (in `DownloadsManager.svelte`) wraps the actions and `reloadView`.
 *
 * The selected folder, search and sort are not here: the page computes them and the island links to them.
 */

/** Field errors and a general message of a refused action. */
export interface Failure {
    fields: Record<string, string>;
    message: string;
}
export type PortResult = { ok: true } | ({ ok: false } & Failure);

export interface DownloadsPort {
    deleteDownload(id: number): Promise<PortResult>;
    deleteDirectory(id: number): Promise<PortResult>;
    createDirectory(input: { name: string; departmentId: number | null }): Promise<PortResult>;
    /** Reloads the page so the lists show the change. */
    refresh(): Promise<void>;
}

export interface DeleteTarget {
    kind: 'file' | 'folder';
    id: number;
    name: string;
}

export interface DownloadsView {
    delete: { open: boolean; busy: boolean; target: DeleteTarget | null };
    folder: { open: boolean; busy: boolean; error: string };
}

export interface DownloadsSession {
    snapshot(): DownloadsView;
    askDelete(kind: DeleteTarget['kind'], id: number, name: string): void;
    setDeleteOpen(open: boolean): void;
    /** Deletes the asked target. On success the dialog stays pending until the reload replaces the page. */
    confirmDelete(): Promise<void>;
    openFolder(): void;
    setFolderOpen(open: boolean): void;
    /** `department` is the select's value: '' means General (no department). */
    createFolder(name: string, department: string): Promise<void>;
}

export function createDownloadsSession(options: {
    port: DownloadsPort;
    onChange: (view: DownloadsView) => void;
    /** Receives the message of a refused delete. */
    onError: (message: string) => void;
}): DownloadsSession {
    const { port, onChange, onError } = options;
    let view: DownloadsView = {
        delete: { open: false, busy: false, target: null },
        folder: { open: false, busy: false, error: '' },
    };
    const set = (patch: { delete?: Partial<DownloadsView['delete']>; folder?: Partial<DownloadsView['folder']> }) => {
        view = { delete: { ...view.delete, ...patch.delete }, folder: { ...view.folder, ...patch.folder } };
        onChange(view);
    };

    return {
        snapshot: () => view,
        askDelete(kind, id, name) {
            set({ delete: { target: { kind, id, name }, open: true } });
        },
        setDeleteOpen(open) {
            set({ delete: { open } });
        },
        async confirmDelete() {
            const target = view.delete.target;
            if (!target) return;
            set({ delete: { busy: true } });
            const result = await (target.kind === 'file'
                ? port.deleteDownload(target.id)
                : port.deleteDirectory(target.id));
            if (!result.ok) {
                set({ delete: { busy: false, open: false } });
                onError(result.message);
                return;
            }
            await port.refresh();
        },
        openFolder() {
            set({ folder: { open: true, error: '' } });
        },
        setFolderOpen(open) {
            set({ folder: open ? { open, error: '' } : { open } });
        },
        async createFolder(name, department) {
            set({ folder: { busy: true, error: '' } });
            const result = await port.createDirectory({
                name: name.trim(),
                departmentId: department ? Number(department) : null,
            });
            if (!result.ok) {
                set({ folder: { busy: false, error: result.fields.name || result.message } });
                return;
            }
            await port.refresh();
        },
    };
}
