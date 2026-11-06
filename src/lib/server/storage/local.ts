import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { RangeNotSatisfiableError, UploadTooLargeError } from './errors';
import { resolveRange } from './range';
import type { ListedObject, StorageDriver } from './types';

export interface LocalDriver extends StorageDriver {
    resolve(key: string): string;
    /**
     * Streams a request body to `key` without holding it in memory; returns the bytes written.
     * Stops, removes the partial file and throws `UploadTooLargeError` as soon as more than
     * `maxBytes` arrive, and leaves nothing under `key` when the stream fails.
     */
    putStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number>;
}

/** Files on the server's disk under `root` (UPLOAD_DIR). */
export function createLocalDriver(rootDir: string): LocalDriver {
    const root = path.resolve(rootDir);

    function resolve(key: string): string {
        const full = path.resolve(root, key);
        if (full === root || !full.startsWith(root + path.sep)) throw new Error('Invalid storage key');
        return full;
    }

    async function* walk(dir: string): AsyncGenerator<ListedObject> {
        const entries = await readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
            throw error;
        });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                yield* walk(full);
            } else if (entry.isFile()) {
                // A file removed between readdir and stat is simply gone.
                const info = await stat(full).catch(() => null);
                if (info) {
                    yield {
                        key: path.relative(root, full).split(path.sep).join('/'),
                        size: info.size,
                        mtime: info.mtime,
                    };
                }
            }
        }
    }

    // The one partial-file write: bytes go to a temporary sibling that is renamed into place on
    // success, so a failed upload never leaves a partial file under its key. On failure the sink is
    // closed (awaited) before the partial file is removed, because a sink still opening or flushing
    // would otherwise create the file again after the removal.
    async function writePartial<T>(key: string, fill: (sink: WriteStream) => Promise<T>): Promise<T> {
        const full = resolve(key);
        await mkdir(path.dirname(full), { recursive: true });
        const partial = `${full}.${randomBytes(6).toString('hex')}.part`;
        const sink = createWriteStream(partial);
        // A write error with no listener would crash the process; keep the first and surface it.
        let sinkError: Error | null = null;
        sink.on('error', (error) => (sinkError ??= error));
        try {
            const result = await fill(sink);
            if (sinkError) throw sinkError;
            await rename(partial, full);
            return result;
        } catch (error) {
            if (!sink.closed) {
                const closed = once(sink, 'close');
                sink.destroy();
                await closed;
            }
            await rm(partial, { force: true });
            throw error;
        }
    }

    return {
        name: 'local',
        resolve,
        async put(key, body) {
            await writePartial(key, (sink) => pipeline(Readable.fromWeb(body.stream() as NodeReadableStream), sink));
        },
        async putStream(key, body, maxBytes) {
            return writePartial(key, async (sink) => {
                // Read by hand and never cancel `body`: cancelling a request body that Node is still
                // feeding makes the runtime enqueue into a closed stream later, which throws
                // `ERR_INVALID_STATE` outside any handler and kills the server. An abandoned body is
                // dropped by the HTTP server once the response is sent.
                const reader = body.getReader();
                let written = 0;
                try {
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (sink.errored) throw sink.errored;
                        if (done) break;
                        written += value.length;
                        if (written > maxBytes) throw new UploadTooLargeError(maxBytes);
                        if (!sink.write(value)) await once(sink, 'drain');
                    }
                    sink.end();
                    await once(sink, 'finish');
                    return written;
                } finally {
                    reader.releaseLock();
                }
            });
        },
        async delete(key) {
            await rm(resolve(key), { force: true });
        },
        async head(key) {
            const info = await stat(resolve(key)).catch(() => null);
            return info?.isFile() ? { size: info.size } : null;
        },
        async get(key, range) {
            const full = resolve(key);
            const info = await stat(full).catch(() => null);
            if (!info?.isFile()) return null;
            const slice = range ? resolveRange(range, info.size) : null;
            if (range && !slice) throw new RangeNotSatisfiableError(info.size);
            return {
                body: Readable.toWeb(createReadStream(full, slice ?? undefined)) as ReadableStream<Uint8Array>,
                size: info.size,
                mtime: info.mtime,
                contentType: null,
                range: slice,
            };
        },
        async *list(prefix = '') {
            for await (const object of walk(root)) {
                if (object.key.startsWith(prefix)) yield object;
            }
        },
    };
}
