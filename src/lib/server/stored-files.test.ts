import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createStoredFiles, type FileStore } from './stored-files';
import { variantKeysOf } from './storage/variants';

/** In-memory storage: keys that exist, with switchable failures. */
function fakeStore() {
    const keys = new Set<string>();
    let counter = 0;
    const failing = { put: false, variant: false, removeKeys: new Set<string>() };
    const store: FileStore = {
        async put(prefix) {
            if (failing.put) throw new Error('put failed');
            const key = `${prefix}/new-${++counter}.webp`;
            keys.add(key);
            return key;
        },
        async remove(key) {
            if (failing.removeKeys.has(key)) throw new Error(`remove failed: ${key}`);
            keys.delete(key);
        },
        async putVariants(key) {
            if (failing.variant) throw new Error('variant failed');
            const variants = variantKeysOf(key);
            for (const variant of variants) keys.add(variant);
            return variants;
        },
    };
    return { keys, failing, files: createStoredFiles(store) };
}

const file = (name = 'a.webp') => new File(['x'], name, { type: 'image/webp' });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('image variants', () => {
    it('stores the variant in the same commit and removes the old original with its variant', async () => {
        const { keys, files } = fakeStore();
        keys.add('posts/old.webp');
        keys.add('posts/old.w640.webp');
        await files.commitWithFiles({
            files: { image: { prefix: 'posts', file: file(), variant: true } },
            run: async ({ image }) => image,
            stale: ['posts/old.webp'],
        });
        expect([...keys].sort()).toEqual(['posts/new-1.w640.webp', 'posts/new-1.webp']);
    });

    it('removes the original and its variant when the commit fails', async () => {
        const { keys, files } = fakeStore();
        await expect(
            files.commitWithFiles({
                files: { image: { prefix: 'posts', file: file(), variant: true } },
                run: async () => {
                    throw new Error('db down');
                },
            }),
        ).rejects.toThrow('db down');
        expect([...keys]).toEqual([]);
    });

    it('still commits when the variant cannot be made', async () => {
        const { keys, failing, files } = fakeStore();
        failing.variant = true;
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const key = await files.commitWithFiles({
            files: { image: { prefix: 'posts', file: file(), variant: true } },
            run: async ({ image }) => image,
        });
        expect(key).toBe('posts/new-1.webp');
        expect([...keys]).toEqual(['posts/new-1.webp']);
    });

    it('removes the variant with an owned file', async () => {
        const { keys, files } = fakeStore();
        keys.add('posts/a.webp');
        keys.add('posts/a.w640.webp');
        await files.deleteWithFiles(async () => 1, ['posts/a.webp']);
        expect([...keys]).toEqual([]);
    });
});

describe('commitWithFiles', () => {
    it('stores the new file, commits with its key and removes the old key', async () => {
        const { keys, files } = fakeStore();
        keys.add('posts/old.webp');
        const result = await files.commitWithFiles({
            files: { image: { prefix: 'posts', file: file() } },
            run: async ({ image }) => ({ saved: image }),
            stale: ['posts/old.webp'],
        });
        expect(result.saved).toBe('posts/new-1.webp');
        expect([...keys]).toEqual(['posts/new-1.webp']);
    });

    it('removes the new file and rethrows when the commit fails, keeping the old file', async () => {
        const { keys, files } = fakeStore();
        keys.add('posts/old.webp');
        await expect(
            files.commitWithFiles({
                files: { image: { prefix: 'posts', file: file() } },
                run: async () => {
                    throw new Error('db down');
                },
                stale: ['posts/old.webp'],
            }),
        ).rejects.toThrow('db down');
        expect([...keys]).toEqual(['posts/old.webp']);
    });

    it('keeps the new file and returns the result when removing the old file fails', async () => {
        const { keys, failing, files } = fakeStore();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        keys.add('posts/old.webp');
        failing.removeKeys.add('posts/old.webp');
        const result = await files.commitWithFiles({
            files: { image: { prefix: 'posts', file: file() } },
            run: async ({ image }) => image,
            stale: ['posts/old.webp'],
        });
        expect(result).toBe('posts/new-1.webp');
        expect(keys.has('posts/new-1.webp')).toBe(true);
        expect(error).toHaveBeenCalled();
    });

    it('keeps the new file when a stale-key lookup fails after the commit', async () => {
        const { keys, files } = fakeStore();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = await files.commitWithFiles({
            files: { image: { prefix: 'carousels', file: file() } },
            run: async ({ image }) => image,
            stale: async () => {
                throw new Error('count failed');
            },
        });
        expect(result).toBe('carousels/new-1.webp');
        expect(keys.has('carousels/new-1.webp')).toBe(true);
        expect(error).toHaveBeenCalled();
    });

    it('does not remove old keys before the commit has run', async () => {
        const { keys, files } = fakeStore();
        keys.add('posts/old.webp');
        await files.commitWithFiles({
            files: { image: { prefix: 'posts', file: file() } },
            run: async () => {
                expect(keys.has('posts/old.webp')).toBe(true);
            },
            stale: ['posts/old.webp'],
        });
        expect(keys.has('posts/old.webp')).toBe(false);
    });

    it('skips empty uploads and null stale keys', async () => {
        const { keys, files } = fakeStore();
        const result = await files.commitWithFiles({
            files: { image: null, other: undefined },
            run: async (stored) => stored,
            stale: [null, undefined],
        });
        expect(result).toEqual({});
        expect(keys.size).toBe(0);
    });

    it('removes already stored files when a later put fails', async () => {
        const { keys } = fakeStore();
        let calls = 0;
        const store: FileStore = {
            put: async (prefix) => {
                if (++calls === 2) throw new Error('second put failed');
                const key = `${prefix}/first.webp`;
                keys.add(key);
                return key;
            },
            remove: async (key) => void keys.delete(key),
        };
        const stored = createStoredFiles(store);
        await expect(
            stored.commitWithFiles({
                files: { a: { prefix: 'posts', file: file() }, b: { prefix: 'posts', file: file() } },
                run: async () => 'never',
            }),
        ).rejects.toThrow('second put failed');
        expect(keys.size).toBe(0);
    });

    it('removes adopted keys when the commit fails and keeps them when it succeeds', async () => {
        const { keys, files } = fakeStore();
        keys.add('downloads/a.pdf');
        keys.add('downloads/b.pdf');
        await expect(
            files.commitWithFiles({
                adopted: ['downloads/a.pdf'],
                run: async () => {
                    throw new Error('db down');
                },
            }),
        ).rejects.toThrow('db down');
        await files.commitWithFiles({ adopted: ['downloads/b.pdf'], run: async () => 'ok' });
        expect([...keys]).toEqual(['downloads/b.pdf']);
    });
});

describe('deleteWithFiles', () => {
    it('removes the owned keys after the row delete', async () => {
        const { keys, files } = fakeStore();
        keys.add('a');
        keys.add('b');
        const result = await files.deleteWithFiles(async () => {
            expect(keys.size).toBe(2);
            return { id: 1 };
        }, ['a', null, 'b']);
        expect(result).toEqual({ id: 1 });
        expect(keys.size).toBe(0);
    });

    it('keeps every file when the row delete fails', async () => {
        const { keys, files } = fakeStore();
        keys.add('a');
        await expect(
            files.deleteWithFiles(async () => {
                throw new Error('db down');
            }, ['a']),
        ).rejects.toThrow('db down');
        expect(keys.has('a')).toBe(true);
    });

    it('logs a failing removal, still removes the others and returns the result', async () => {
        const { keys, failing, files } = fakeStore();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        keys.add('a');
        keys.add('b');
        failing.removeKeys.add('a');
        const result = await files.deleteWithFiles(async () => 'deleted', ['a', 'b']);
        expect(result).toBe('deleted');
        expect([...keys]).toEqual(['a']);
        expect(error).toHaveBeenCalledTimes(1);
    });

    it('accepts a function that resolves the keys after the delete', async () => {
        const { keys, files } = fakeStore();
        keys.add('a');
        await files.deleteWithFiles(
            async () => undefined,
            async () => ['a'],
        );
        expect(keys.size).toBe(0);
    });
});

describe('discardFiles', () => {
    it('removes the keys, logs a failing removal and never throws', async () => {
        const { keys, failing, files } = fakeStore();
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        keys.add('a');
        keys.add('b');
        failing.removeKeys.add('a');
        await expect(files.discardFiles(['a', 'b', null], 'rejected upload')).resolves.toBeUndefined();
        expect([...keys]).toEqual(['a']);
        expect(error).toHaveBeenCalledWith('Stored file cleanup failed (rejected upload): a', expect.any(Error));
    });
});
