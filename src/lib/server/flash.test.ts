import { describe, expect, it } from 'vite-plus/test';
import { decodeFlash, encodeFlash } from './flash';

describe('flash cookie payload', () => {
    it('round-trips and truncates long messages', () => {
        expect(decodeFlash(encodeFlash({ type: 'success', message: 'Saved.' }))).toEqual({
            type: 'success',
            message: 'Saved.',
        });
        const long = decodeFlash(encodeFlash({ type: 'error', message: 'x'.repeat(1000) }));
        expect(long?.message).toHaveLength(300);
    });

    it('ignores missing, malformed or oversized values', () => {
        expect(decodeFlash(undefined)).toBeNull();
        expect(decodeFlash('not json')).toBeNull();
        expect(decodeFlash('{"type":"warning","message":"x"}')).toBeNull();
        expect(decodeFlash('{"type":"success","message":""}')).toBeNull();
        expect(decodeFlash(JSON.stringify({ type: 'success', message: 'x'.repeat(5000) }))).toBeNull();
    });
});
