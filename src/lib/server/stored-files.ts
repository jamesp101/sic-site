/**
 * Stored-file lifecycle: the one place that decides when uploaded files are written and removed
 * around a database write. Free of `astro:*` imports.
 *
 * Rules: new files are stored first; if the commit fails the new files are removed and the error
 * is rethrown; if it succeeds the stale files are removed. Cleanup failures are logged and never
 * undo a new file or fail the request.
 */
import { putCardVariant } from './image-variant';
import { put, remove, type StoragePrefix } from './storage';
import { variantKeyOf } from './storage/variants';

export type StoredKey = string | null | undefined;

export interface FileStore {
    put(prefix: StoragePrefix, file: File): Promise<string>;
    remove(key: string): Promise<void>;
    /** Stores the derived variant of the stored image `key` (`variants.ts`); resolves to its key, or null when it has none. */
    putVariant?(key: string, file: File): Promise<string | null>;
}

export interface NewFile {
    prefix: StoragePrefix;
    file: File;
    /** Also store the image's card variant in the same commit (a failure is logged; the page falls back to the original). */
    variant?: boolean;
}

/** Keys to delete once the commit succeeded; a function runs after the commit (e.g. to find files no row references any more). */
export type StaleKeys = readonly StoredKey[] | (() => Promise<readonly StoredKey[]> | readonly StoredKey[]);

export type NewFiles = Record<string, NewFile | null | undefined>;

/** Stored key of each named file: always set for a file that is always given, `undefined` when it may be empty. */
export type StoredKeys<F extends NewFiles> = {
    [P in keyof F]: Extract<F[P], null | undefined> extends never ? string : string | undefined;
};

export interface Commit<F extends NewFiles, T> {
    /** Files to store before the commit, by name; empty entries are skipped. */
    files?: F;
    /** Keys already stored (e.g. a direct upload) that belong to the commit and are removed if it fails. */
    adopted?: readonly StoredKey[];
    /** Writes the row(s). Receives the stored key of each new file by name. */
    run: (keys: StoredKeys<F>) => Promise<T>;
    /** Keys that became unused because the commit succeeded. */
    stale?: StaleKeys;
}

export function createStoredFiles(store: FileStore) {
    async function removeAll(keys: readonly StoredKey[], context: string): Promise<void> {
        await Promise.all(
            keys
                .flatMap((key) => (key ? [key, variantKeyOf(key)] : []))
                .map(async (key) => {
                    if (!key) return;
                    try {
                        await store.remove(key);
                    } catch (error) {
                        console.error(`Stored file cleanup failed (${context}): ${key}`, error);
                    }
                }),
        );
    }

    async function cleanup(stale: StaleKeys | undefined, context: string): Promise<void> {
        if (!stale) return;
        try {
            await removeAll(typeof stale === 'function' ? await stale() : stale, context);
        } catch (error) {
            console.error(`Stored file cleanup failed (${context})`, error);
        }
    }

    async function storeVariant(key: string, file: File): Promise<void> {
        try {
            await store.putVariant?.(key, file);
        } catch (error) {
            console.error(`Image variant failed: ${key}`, error);
        }
    }

    /** Stores the new files, runs the commit, then removes stale keys (see the module rules). */
    async function commitWithFiles<F extends NewFiles, T>({
        files,
        adopted = [],
        run,
        stale,
    }: Commit<F, T>): Promise<T> {
        const keys: Record<string, string | undefined> = {};
        const stored: string[] = adopted.filter((key): key is string => !!key);
        try {
            for (const [name, upload] of Object.entries(files ?? {})) {
                keys[name] = undefined;
                if (!upload) continue;
                const key = await store.put(upload.prefix, upload.file);
                stored.push(key);
                keys[name] = key;
                if (upload.variant) await storeVariant(key, upload.file);
            }
            const result = await run(keys as StoredKeys<F>);
            await cleanup(stale, 'replaced');
            return result;
        } catch (error) {
            // `cleanup` never throws, so this only sees put / commit failures.
            await removeAll(stored, 'rolled back');
            throw error;
        }
    }

    /** Runs the row delete, then removes the files the row owned. */
    async function deleteWithFiles<T>(run: () => Promise<T>, owned: StaleKeys): Promise<T> {
        const result = await run();
        await cleanup(owned, 'deleted');
        return result;
    }

    /** Removes stored files that no row owns (e.g. a rejected direct upload); failures are logged, never thrown. */
    async function discardFiles(keys: readonly StoredKey[], context: string): Promise<void> {
        await removeAll(keys, context);
    }

    return { commitWithFiles, deleteWithFiles, discardFiles };
}

export const { commitWithFiles, deleteWithFiles, discardFiles } = createStoredFiles({
    put,
    remove,
    putVariant: putCardVariant,
});
