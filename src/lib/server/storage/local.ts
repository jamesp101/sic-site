import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { StorageDriver } from './types';

/** Files on the server's disk under `root` (UPLOAD_DIR). */
export function createLocalDriver(rootDir: string): StorageDriver & { resolve(key: string): string } {
    const root = path.resolve(rootDir);

    function resolve(key: string): string {
        const full = path.resolve(root, key);
        if (full === root || !full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
        return full;
    }

    return {
        name: 'local',
        resolve,
        // Streams to a temporary sibling and renames it into place, so the file is never held in
        // memory and a failed upload never leaves a partial file under its key.
        async put(key, body) {
            const full = resolve(key);
            await mkdir(path.dirname(full), { recursive: true });
            const partial = `${full}.${randomBytes(6).toString('hex')}.part`;
            try {
                await pipeline(Readable.fromWeb(body.stream() as NodeReadableStream), createWriteStream(partial));
                await rename(partial, full);
            } catch (error) {
                await rm(partial, { force: true });
                throw error;
            }
        },
        async delete(key) {
            await rm(resolve(key), { force: true });
        },
        async get(key) {
            const full = resolve(key);
            const info = await stat(full).catch(() => null);
            if (!info?.isFile()) return null;
            return {
                body: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
                size: info.size,
                mtime: info.mtime,
                contentType: null,
            };
        },
    };
}
