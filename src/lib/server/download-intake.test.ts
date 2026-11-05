import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./db', () => ({ db: {} }));

const { createDownloadIntake } = await import('./download-intake');
const { RequestError } = await import('./request-error');

const KEY = `downloads/${'a'.repeat(32)}.pdf`;
const MAX = 100;

function setup(opts: { head?: { size: number } | null; owned?: boolean; direct?: boolean } = {}) {
    const claims: string[] = [];
    const removed: string[] = [];
    const deps = {
        directUploads: opts.direct ?? true,
        maxBytes: MAX,
        ownsPendingUpload: vi.fn(async () => opts.owned ?? true),
        claimPendingUpload: vi.fn(async (key: string) => {
            claims.push(key);
            return opts.owned ?? true;
        }),
        headUpload: vi.fn(async () => (opts.head === undefined ? { size: 10 } : opts.head)),
        put: vi.fn(async () => 'downloads/stored.pdf'),
        discardFiles: vi.fn(async (keys: readonly string[]) => void removed.push(...keys)),
    };
    return { deps, claims, removed, intake: createDownloadIntake(deps) };
}

async function rejection(promise: Promise<unknown>) {
    try {
        await promise;
    } catch (error) {
        expect(error).toBeInstanceOf(RequestError);
        return (error as Error).message;
    }
    throw new Error('expected a rejection');
}

describe('acceptDownloadFile: multipart', () => {
    it('stores the file and returns its key and size', async () => {
        const { intake, deps } = setup();
        const file = new File(['hello'], 'a.pdf');
        expect(await intake.acceptDownloadFile(1, { file })).toEqual({ key: 'downloads/stored.pdf', size: 5 });
        expect(deps.put).toHaveBeenCalledWith(file);
    });

    it('requires a file when there is no uploaded key', async () => {
        const { intake } = setup();
        expect(await rejection(intake.acceptDownloadFile(1, {}))).toBe('Choose a file to upload.');
    });
});

describe('acceptDownloadFile: direct upload', () => {
    it('verifies the object, then consumes the claim, and returns the stored size', async () => {
        const { intake, claims, deps } = setup({ head: { size: 42 } });
        expect(await intake.acceptDownloadFile(7, { uploadedKey: KEY })).toEqual({ key: KEY, size: 42 });
        expect(claims).toEqual([KEY]);
        expect(deps.claimPendingUpload).toHaveBeenCalledWith(KEY, 7);
    });

    it('does not consume the claim when the object is missing', async () => {
        const { intake, claims } = setup({ head: null });
        expect(await rejection(intake.acceptDownloadFile(1, { uploadedKey: KEY }))).toBe(
            'The uploaded file was not found. Upload it again.',
        );
        expect(claims).toEqual([]);
    });

    it('rejects an oversized object, consuming the claim and removing it', async () => {
        const { intake, claims, removed } = setup({ head: { size: MAX + 1 } });
        expect(await rejection(intake.acceptDownloadFile(1, { uploadedKey: KEY }))).toMatch(/must not be larger/);
        expect(claims).toEqual([KEY]);
        expect(removed).toEqual([KEY]);
    });

    it("never touches an object whose claim is not the caller's", async () => {
        const { intake, deps, removed } = setup({ owned: false, head: { size: MAX + 1 } });
        expect(await rejection(intake.acceptDownloadFile(2, { uploadedKey: KEY }))).toBe('Invalid uploaded file.');
        expect(deps.headUpload).not.toHaveBeenCalled();
        expect(removed).toEqual([]);
    });

    it('rejects keys the server did not issue and direct uploads that are disabled', async () => {
        expect(await rejection(setup().intake.acceptDownloadFile(1, { uploadedKey: 'downloads/evil.pdf' }))).toBe(
            'Invalid uploaded file.',
        );
        expect(await rejection(setup({ direct: false }).intake.acceptDownloadFile(1, { uploadedKey: KEY }))).toBe(
            'Invalid uploaded file.',
        );
    });
});
