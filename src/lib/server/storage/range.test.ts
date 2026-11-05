import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { RangeNotSatisfiableError, UploadTooLargeError } from './errors';
import { createLocalDriver } from './local';
import { parseRangeHeader, rangeHeaderValue, resolveRange } from './range';

describe('parseRangeHeader', () => {
    it('reads a single bytes range', () => {
        expect(parseRangeHeader('bytes=0-99')).toEqual({ start: 0, end: 99 });
        expect(parseRangeHeader('bytes=100-')).toEqual({ start: 100 });
        expect(parseRangeHeader('bytes=-500')).toEqual({ suffix: 500 });
        expect(parseRangeHeader(' bytes=7-7 ')).toEqual({ start: 7, end: 7 });
    });

    it('ignores what it does not serve as a range', () => {
        for (const header of [
            null,
            undefined,
            '',
            'bytes=',
            'bytes=-',
            'bytes=5-2',
            'bytes=0-1,5-6',
            `bytes=0-${'9'.repeat(16)}`,
            `bytes=${'9'.repeat(16)}-`,
            `bytes=-${'9'.repeat(16)}`,
            'items=0-1',
            'bytes=a-b',
        ]) {
            expect(parseRangeHeader(header), String(header)).toBeNull();
        }
    });
});

describe('resolveRange', () => {
    it('clamps the end to the object', () => {
        expect(resolveRange({ start: 0, end: 99 }, 1000)).toEqual({ start: 0, end: 99 });
        expect(resolveRange({ start: 900, end: 5000 }, 1000)).toEqual({ start: 900, end: 999 });
        expect(resolveRange({ start: 900 }, 1000)).toEqual({ start: 900, end: 999 });
        expect(resolveRange({ suffix: 100 }, 1000)).toEqual({ start: 900, end: 999 });
        expect(resolveRange({ suffix: 5000 }, 1000)).toEqual({ start: 0, end: 999 });
    });

    it('returns null when no byte is selected', () => {
        expect(resolveRange({ start: 1000 }, 1000)).toBeNull();
        expect(resolveRange({ start: 0, end: 5 }, 0)).toBeNull();
        expect(resolveRange({ suffix: 0 }, 1000)).toBeNull();
    });

    it('round-trips into the header S3 expects', () => {
        expect(rangeHeaderValue({ start: 0, end: 99 })).toBe('bytes=0-99');
        expect(rangeHeaderValue({ start: 5 })).toBe('bytes=5-');
        expect(rangeHeaderValue({ suffix: 9 })).toBe('bytes=-9');
    });
});

describe('local driver: ranges and streamed uploads', () => {
    let dir: string;
    beforeAll(async () => {
        dir = await mkdtemp(path.join(os.tmpdir(), 'sic-range-'));
    });
    afterAll(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    const bytes = Uint8Array.from({ length: 1000 }, (_, index) => index % 251);
    const text = async (stream: ReadableStream<Uint8Array>) => new Uint8Array(await new Response(stream).arrayBuffer());

    it('serves the requested slice with the total size and the resolved range', async () => {
        const driver = createLocalDriver(dir);
        await driver.put('videos/a.mp4', new Blob([bytes]), 'video/mp4');

        const whole = await driver.get('videos/a.mp4');
        expect(whole).toMatchObject({ size: 1000, range: null });

        const head = await driver.get('videos/a.mp4', { start: 0, end: 99 });
        expect(head).toMatchObject({ size: 1000, range: { start: 0, end: 99 } });
        expect(await text(head!.body)).toEqual(bytes.slice(0, 100));

        const tail = await driver.get('videos/a.mp4', { suffix: 10 });
        expect(tail?.range).toEqual({ start: 990, end: 999 });
        expect(await text(tail!.body)).toEqual(bytes.slice(990));

        const open = await driver.get('videos/a.mp4', { start: 995, end: 5000 });
        expect(open?.range).toEqual({ start: 995, end: 999 });
        expect(await text(open!.body)).toEqual(bytes.slice(995));
    });

    it('throws for an unsatisfiable range and returns null for a missing object', async () => {
        const driver = createLocalDriver(dir);
        await driver.put('videos/b.mp4', new Blob([bytes]), 'video/mp4');
        await expect(driver.get('videos/b.mp4', { start: 1000 })).rejects.toThrow(RangeNotSatisfiableError);
        await expect(driver.get('videos/b.mp4', { start: 1000 })).rejects.toMatchObject({ size: 1000 });
        expect(await driver.get('videos/missing.mp4', { start: 0 })).toBeNull();
    });

    it('head reports the size without opening the body', async () => {
        const driver = createLocalDriver(dir);
        await driver.put('videos/c.mp4', new Blob([bytes]), 'video/mp4');
        expect(await driver.head('videos/c.mp4')).toEqual({ size: 1000 });
        expect(await driver.head('videos/none.mp4')).toBeNull();
    });

    it('putStream stores a body within the limit and reports its size', async () => {
        const driver = createLocalDriver(dir);
        const written = await driver.putStream('videos/d.mp4', new Blob([bytes]).stream(), 1000);
        expect(written).toBe(1000);
        expect(await text((await driver.get('videos/d.mp4'))!.body)).toEqual(bytes);
    });

    it('putStream stops, and leaves nothing behind, once the body passes the limit', async () => {
        const driver = createLocalDriver(dir);
        await expect(driver.putStream('videos/e.mp4', new Blob([bytes]).stream(), 999)).rejects.toThrow(
            UploadTooLargeError,
        );
        expect(await driver.get('videos/e.mp4')).toBeNull();
        expect((await readdir(path.join(dir, 'videos'))).filter((name) => name.startsWith('e.mp4'))).toEqual([]);
    });

    /** A body that keeps a read pending after its chunks, like a request still being sent. */
    function liveBody(chunks: number[], onCancel: () => void, failAfter?: Error) {
        return new ReadableStream<Uint8Array>({
            start(controller) {
                for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(1));
                if (failAfter) controller.error(failAfter);
            },
            pull: () => new Promise<void>(() => {}),
            cancel: onCancel,
        });
    }

    it('putStream aborts an overrun without cancelling the body or leaving a partial file', async () => {
        // Cancelling a request body that Node is still feeding later throws ERR_INVALID_STATE
        // outside any handler (crashing the server); vitest also fails on any unhandled error here.
        const driver = createLocalDriver(dir);
        let cancelled = false;
        await expect(
            driver.putStream(
                'videos/f.mp4',
                liveBody([600, 600], () => (cancelled = true)),
                1000,
            ),
        ).rejects.toThrow(UploadTooLargeError);
        expect(cancelled).toBe(false);
        expect(await driver.get('videos/f.mp4')).toBeNull();
        expect((await readdir(path.join(dir, 'videos'))).filter((name) => name.startsWith('f.mp4'))).toEqual([]);
    });

    it('putStream surfaces a client abort and removes the partial file', async () => {
        const driver = createLocalDriver(dir);
        await expect(
            driver.putStream(
                'videos/g.mp4',
                liveBody([100], () => {}, new Error('client went away')),
                1000,
            ),
        ).rejects.toThrow('client went away');
        expect((await readdir(path.join(dir, 'videos'))).filter((name) => name.startsWith('g.mp4'))).toEqual([]);
    });

    it('putStream returns the short length of a body that ends early, for the caller to reject', async () => {
        const driver = createLocalDriver(dir);
        const short = new Blob([bytes.slice(0, 10)]).stream();
        expect(await driver.putStream('videos/h.mp4', short, 1000)).toBe(10);
    });
});
