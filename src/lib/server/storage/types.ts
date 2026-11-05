import type { ByteRange, ResolvedRange } from './range';

export interface StoredObject {
    body: ReadableStream<Uint8Array>;
    /** Total size of the object (not of the served slice). */
    size: number;
    mtime: Date | null;
    contentType: string | null;
    /** The inclusive slice `body` holds when a range was requested; null when it is the whole object. */
    range: ResolvedRange | null;
}

export interface ListedObject {
    key: string;
    size: number;
    mtime: Date;
}

/** Backend for uploaded files. Keys are bare relative paths such as `posts/abc.jpg`. */
export interface StorageDriver {
    readonly name: 'local' | 's3';
    /** Stores `body` (an uploaded `File` or other Blob) under `key`; drivers read it as a stream where they can. */
    put(key: string, body: Blob, contentType: string): Promise<void>;
    delete(key: string): Promise<void>;
    /**
     * Returns null when the object does not exist. With `range` the body holds only that slice and
     * `range` on the result says which; a range that selects no byte throws `RangeNotSatisfiableError`.
     */
    get(key: string, range?: ByteRange): Promise<StoredObject | null>;
    /** Size of an existing object, or null when it does not exist. Never opens the body. */
    head(key: string): Promise<{ size: number } | null>;
    /** Every stored object whose key starts with `prefix` (all when omitted), as bare keys. Includes unfinished temporary files. */
    list(prefix?: string): AsyncIterable<ListedObject>;
}
