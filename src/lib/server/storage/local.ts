import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
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
        async put(key, body) {
            const full = resolve(key);
            await mkdir(path.dirname(full), { recursive: true });
            await writeFile(full, body);
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
