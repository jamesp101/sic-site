/**
 * HTTP `Range` support shared by the storage drivers and the `/storage` route. Only a single
 * `bytes=` range is honoured; anything else is ignored (the full object is served), as RFC 9110 allows.
 */

/** An HTTP byte range: `start-end` (end optional, inclusive) or the last `suffix` bytes. */
export type ByteRange = { start: number; end?: number } | { suffix: number };

/** A resolved, inclusive slice of an object. */
export interface ResolvedRange {
    start: number;
    end: number;
}

// At most 15 digits per number (< 2^53), so every parsed value is a safe integer.
const SINGLE_RANGE = /^bytes=(\d{0,15})-(\d{0,15})$/;

/** Parses a `Range` header value; null when it is absent, not a single `bytes` range or malformed. */
export function parseRangeHeader(header: string | null | undefined): ByteRange | null {
    const match = SINGLE_RANGE.exec(header?.trim() ?? '');
    if (!match) return null;
    const [, first, last] = match;
    if (!first && !last) return null;
    if (!first) return { suffix: Number(last) };
    const start = Number(first);
    if (!last) return { start };
    const end = Number(last);
    // `bytes=5-2` is malformed, not unsatisfiable: ignore it.
    return end < start ? null : { start, end };
}

/** Resolves `range` against an object of `size` bytes; null when it selects no byte (416). */
export function resolveRange(range: ByteRange, size: number): ResolvedRange | null {
    if (size <= 0) return null;
    if ('suffix' in range) {
        return range.suffix <= 0 ? null : { start: Math.max(0, size - range.suffix), end: size - 1 };
    }
    if (range.start >= size) return null;
    return { start: range.start, end: Math.min(range.end ?? size - 1, size - 1) };
}

/** The `Range` header value S3 expects for `range`. */
export function rangeHeaderValue(range: ByteRange): string {
    if ('suffix' in range) return `bytes=-${range.suffix}`;
    return `bytes=${range.start}-${range.end ?? ''}`;
}
