export interface StoredObject {
    body: ReadableStream<Uint8Array>;
    size: number;
    mtime: Date | null;
    contentType: string | null;
}

/** Backend for uploaded files. Keys are bare relative paths such as `posts/abc.jpg`. */
export interface StorageDriver {
    readonly name: 'local' | 's3';
    put(key: string, body: Uint8Array, contentType: string): Promise<void>;
    delete(key: string): Promise<void>;
    /** Returns null when the object does not exist. */
    get(key: string): Promise<StoredObject | null>;
}
