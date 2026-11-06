import { describe, expect, it } from 'vite-plus/test';
import { createDownloadsSession, type DownloadsPort, type DownloadsView } from './downloads-session';

/** In-memory server: records calls; each kind in `failing` is refused. */
function setup(failing: Record<string, { fields?: Record<string, string>; message: string }> = {}) {
    const calls: string[] = [];
    const errors: string[] = [];
    let view: DownloadsView | undefined;
    const port: DownloadsPort = {
        async deleteDownload(id) {
            calls.push(`deleteDownload:${id}`);
            return failing.deleteDownload ? { ok: false, ...failing.deleteDownload, fields: {} } : { ok: true };
        },
        async deleteDirectory(id) {
            calls.push(`deleteDirectory:${id}`);
            return failing.deleteDirectory ? { ok: false, ...failing.deleteDirectory, fields: {} } : { ok: true };
        },
        async createDirectory(input) {
            calls.push(`createDirectory:${input.name}:${input.departmentId}`);
            return failing.createDirectory ? { ok: false, fields: {}, ...failing.createDirectory } : { ok: true };
        },
        async refresh() {
            calls.push('refresh');
        },
    };
    const session = createDownloadsSession({ port, onChange: (next) => (view = next), onError: (m) => errors.push(m) });
    return { session, calls, errors, view: () => view ?? session.snapshot() };
}

describe('delete', () => {
    it('asking opens the confirmation for the target, naming kind and name', () => {
        const { session, view } = setup();
        session.askDelete('file', 4, 'Handbook.pdf');
        expect(view().delete).toEqual({
            open: true,
            busy: false,
            target: { kind: 'file', id: 4, name: 'Handbook.pdf' },
        });
    });

    it('confirming a Download deletes it, shows pending, then refreshes', async () => {
        const { session, calls, view } = setup();
        session.askDelete('file', 4, 'Handbook.pdf');
        const done = session.confirmDelete();
        expect(view().delete.busy).toBe(true);
        await done;
        expect(calls).toEqual(['deleteDownload:4', 'refresh']);
        expect(view().delete.busy).toBe(true); // stays pending until the reload replaces the page
    });

    it('confirming a Directory deletes the Directory', async () => {
        const { session, calls } = setup();
        session.askDelete('folder', 7, 'Forms');
        await session.confirmDelete();
        expect(calls).toEqual(['deleteDirectory:7', 'refresh']);
    });

    it('a failure closes the dialog, clears pending, reports the message and does not refresh', async () => {
        const { session, calls, errors, view } = setup({ deleteDownload: { message: 'In use.' } });
        session.askDelete('file', 4, 'Handbook.pdf');
        await session.confirmDelete();
        expect(errors).toEqual(['In use.']);
        expect(view().delete.open).toBe(false);
        expect(view().delete.busy).toBe(false);
        expect(calls).toEqual(['deleteDownload:4']);
    });

    it('confirming with nothing asked does nothing', async () => {
        const { session, calls } = setup();
        await session.confirmDelete();
        expect(calls).toEqual([]);
    });

    it('the dialog can be dismissed', () => {
        const { session, view } = setup();
        session.askDelete('file', 4, 'x');
        session.setDeleteOpen(false);
        expect(view().delete.open).toBe(false);
    });
});

describe('create directory', () => {
    it('sends the trimmed name and the department as a number, then refreshes', async () => {
        const { session, calls, view } = setup();
        session.openFolder();
        expect(view().folder.open).toBe(true);
        const done = session.createFolder('  Handbooks ', '12');
        expect(view().folder.busy).toBe(true);
        await done;
        expect(calls).toEqual(['createDirectory:Handbooks:12', 'refresh']);
    });

    it('an empty department means General (null)', async () => {
        const { session, calls } = setup();
        await session.createFolder('Forms', '');
        expect(calls[0]).toBe('createDirectory:Forms:null');
    });

    it('shows the name field error first', async () => {
        const { session, view } = setup({ createDirectory: { fields: { name: 'Name taken.' }, message: 'General.' } });
        await session.createFolder('Forms', '');
        expect(view().folder.error).toBe('Name taken.');
        expect(view().folder.busy).toBe(false);
    });

    it('falls back to the general message, and does not refresh', async () => {
        const { session, calls, view } = setup({ createDirectory: { message: 'Not allowed.' } });
        await session.createFolder('Forms', '');
        expect(view().folder.error).toBe('Not allowed.');
        expect(calls).toEqual(['createDirectory:Forms:null']);
    });

    it('clears the previous error when submitting again and when reopened', async () => {
        const { session, view } = setup({ createDirectory: { message: 'No.' } });
        await session.createFolder('Forms', '');
        session.setFolderOpen(false);
        session.openFolder();
        expect(view().folder.error).toBe('');
    });
});
