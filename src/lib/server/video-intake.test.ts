import { describe, expect, it, vi } from 'vite-plus/test';
import { downloadFile } from './download-intake';
import { isDirectUploadKey, newDirectUploadKey, VIDEO_UPLOAD_PREFIX } from './direct-upload';
import { isVideoUpload, storedType } from './file-types';
import { RequestError } from './request-error';
import { UploadTooLargeError } from './storage/errors';
import { createVideoIntake, isVideoUploadKey, validateVideoUpload, VIDEO_TOO_LARGE } from './video-intake';

// Hoisted above the imports: the intake modules load the database client.
vi.mock('./db', () => ({ db: {} }));

const KEY = `videos/${'b'.repeat(32)}.mp4`;
const MAX = 100;

function setup(
    opts: {
        head?: { size: number } | null;
        owned?: boolean;
        claimed?: boolean;
        receive?: (key: string, body: ReadableStream<Uint8Array>, max: number) => Promise<number>;
    } = {},
) {
    const calls: string[] = [];
    const removed: string[] = [];
    const deps = {
        maxBytes: MAX,
        ownsPendingUpload: vi.fn(async () => {
            calls.push('owns');
            return opts.owned ?? true;
        }),
        claimPendingUpload: vi.fn(async () => {
            calls.push('claim');
            return opts.claimed ?? opts.owned ?? true;
        }),
        headUpload: vi.fn(async () => {
            calls.push('head');
            return opts.head === undefined ? { size: 10 } : opts.head;
        }),
        receiveUpload: vi.fn(opts.receive ?? (async () => 10)),
        discardFiles: vi.fn(async (keys: readonly string[]) => void removed.push(...keys)),
    };
    return { deps, calls, removed, intake: createVideoIntake(deps) };
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

const body = () => new ReadableStream<Uint8Array>();

describe('video types', () => {
    it('accepts MP4 and WebM with a video content type, decided by the extension', () => {
        expect(validateVideoUpload({ fileName: 'Clip.MP4', contentType: 'video/mp4', size: 5 })).toEqual({
            ok: true,
            ext: '.mp4',
            contentType: 'video/mp4',
        });
        // The extension wins over the declared type, so the signed type matches what is served.
        expect(validateVideoUpload({ fileName: 'a.webm', contentType: 'video/mp4', size: 5 })).toMatchObject({
            ok: true,
            ext: '.webm',
            contentType: 'video/webm',
        });
        expect(validateVideoUpload({ fileName: 'clip', contentType: 'video/webm', size: 5 })).toMatchObject({
            ok: true,
            ext: '.webm',
        });
    });

    it('rejects other types, including an image or document renamed to a video or the other way round', () => {
        for (const [fileName, contentType] of [
            ['a.mov', 'video/quicktime'],
            ['a.pdf', 'video/mp4'],
            ['a.mp4', 'application/pdf'],
            ['a.mp4', 'text/html'],
            ['a.png', 'image/png'],
            ['a.mp4', ''],
        ]) {
            expect(validateVideoUpload({ fileName, contentType, size: 5 }).ok, `${fileName} ${contentType}`).toBe(
                false,
            );
        }
    });

    it('enforces the size limit', () => {
        expect(validateVideoUpload({ fileName: 'a.mp4', contentType: 'video/mp4', size: 100 * 1024 * 1024 }).ok).toBe(
            true,
        );
        expect(
            validateVideoUpload({ fileName: 'a.mp4', contentType: 'video/mp4', size: 100 * 1024 * 1024 + 1 }),
        ).toEqual({
            ok: false,
            message: VIDEO_TOO_LARGE,
        });
    });

    it('keeps videos out of Downloads', async () => {
        expect(isVideoUpload('a.mp4', 'video/mp4')).toBe(true);
        expect(isVideoUpload('a.pdf', 'application/pdf')).toBe(false);
        expect(storedType('a.webm', '')).toEqual({ ext: '.webm', contentType: 'video/webm' });
        const parsed = await downloadFile.safeParseAsync(new File(['x'], 'talk.mp4', { type: 'video/mp4' }));
        expect(parsed.success).toBe(false);
        expect(
            (await downloadFile.safeParseAsync(new File(['x'], 'form.pdf', { type: 'application/pdf' }))).success,
        ).toBe(true);
    });

    it('issues server-shaped videos/ keys and recognises only those', () => {
        const key = newDirectUploadKey('a.mp4', 'video/mp4', VIDEO_UPLOAD_PREFIX);
        expect(key).toMatch(/^videos\/[0-9a-f]{32}\.mp4$/);
        expect(isVideoUploadKey(key)).toBe(true);
        expect(isVideoUploadKey(KEY)).toBe(true);
        expect(isVideoUploadKey(`videos/${'b'.repeat(32)}.pdf`)).toBe(false);
        expect(isVideoUploadKey(`downloads/${'b'.repeat(32)}.mp4`)).toBe(false);
        expect(isVideoUploadKey('videos/chosen-by-client.mp4')).toBe(false);
        expect(isVideoUploadKey('videos/../x.mp4')).toBe(false);
        // A downloads key is not a videos key and the other way round.
        expect(isDirectUploadKey(KEY)).toBe(false);
    });
});

describe('complete', () => {
    it('checks the owner, then the object and its size, and only then claims', async () => {
        const { intake, calls } = setup({ head: { size: 42 } });
        expect(await intake.complete(7, KEY)).toEqual({ key: KEY, size: 42 });
        expect(calls).toEqual(['owns', 'head', 'claim']);
    });

    it("rejects someone else's key before touching the object", async () => {
        const { intake, deps, calls, removed } = setup({ owned: false, head: { size: MAX + 1 } });
        expect(await rejection(intake.complete(2, KEY))).toBe('Invalid uploaded file.');
        expect(calls).toEqual(['owns']);
        expect(deps.headUpload).not.toHaveBeenCalled();
        expect(removed).toEqual([]);
    });

    it('rejects keys the server did not issue', async () => {
        const { intake, calls } = setup();
        expect(await rejection(intake.complete(1, 'videos/evil.mp4'))).toBe('Invalid uploaded file.');
        expect(await rejection(intake.complete(1, `downloads/${'a'.repeat(32)}.mp4`))).toBe('Invalid uploaded file.');
        expect(calls).toEqual([]);
    });

    it('does not burn the claim when the object is missing', async () => {
        const { intake, calls } = setup({ head: null });
        expect(await rejection(intake.complete(1, KEY))).toBe('The uploaded video was not found. Upload it again.');
        expect(calls).toEqual(['owns', 'head']);
    });

    it('consumes the claim and removes an oversized object, once', async () => {
        const { intake, calls, removed } = setup({ head: { size: MAX + 1 } });
        expect(await rejection(intake.complete(1, KEY))).toBe(VIDEO_TOO_LARGE);
        expect(calls).toEqual(['owns', 'head', 'claim']);
        expect(removed).toEqual([KEY]);
    });

    it('removes an empty object the same way', async () => {
        const { intake, removed } = setup({ head: { size: 0 } });
        expect(await rejection(intake.complete(1, KEY))).toBe('The uploaded video is empty.');
        expect(removed).toEqual([KEY]);
    });

    it('fails when the claim is lost to a concurrent request', async () => {
        const { intake, removed } = setup({ claimed: false });
        expect(await rejection(intake.complete(1, KEY))).toBe('Invalid uploaded file.');
        expect(removed).toEqual([]);
    });
});

describe('receive (local)', () => {
    it('streams the body for the key owner with the announced size as the cap', async () => {
        const { intake, deps } = setup();
        const stream = body();
        expect(await intake.receive(1, KEY, 10, stream)).toEqual({ size: 10 });
        expect(deps.receiveUpload).toHaveBeenCalledWith(KEY, stream, 10);
    });

    it('checks the owner first and never reads the body of a foreign key', async () => {
        const { intake, deps } = setup({ owned: false });
        expect(await rejection(intake.receive(2, KEY, 10, body()))).toBe('Invalid uploaded file.');
        expect(deps.receiveUpload).not.toHaveBeenCalled();
    });

    it('rejects a size over the limit before reading anything', async () => {
        const { intake, deps } = setup();
        expect(await rejection(intake.receive(1, KEY, MAX + 1, body()))).toBe(VIDEO_TOO_LARGE);
        expect(deps.receiveUpload).not.toHaveBeenCalled();
    });

    it('rejects a missing or invalid size and an empty body', async () => {
        const { intake } = setup();
        expect(await rejection(intake.receive(1, KEY, Number.NaN, body()))).toBe('Choose a file to upload.');
        expect(await rejection(intake.receive(1, KEY, 0, body()))).toBe('Choose a file to upload.');
        expect(await rejection(intake.receive(1, KEY, 10, null))).toBe('Choose a file to upload.');
    });

    it('reports a body that outgrows the announced size', async () => {
        const { intake } = setup({
            receive: async () => {
                throw new UploadTooLargeError(10);
            },
        });
        expect(await rejection(intake.receive(1, KEY, 10, body()))).toMatch(/larger than the size/);
    });

    it('removes a file that is shorter than announced', async () => {
        const { intake, removed } = setup({ receive: async () => 4 });
        expect(await rejection(intake.receive(1, KEY, 10, body()))).toMatch(/incomplete/);
        expect(removed).toEqual([KEY]);
    });

    it('lets other failures through unchanged', async () => {
        const { intake } = setup({
            receive: async () => {
                throw new Error('disk full');
            },
        });
        await expect(intake.receive(1, KEY, 10, body())).rejects.toThrow('disk full');
    });
});
