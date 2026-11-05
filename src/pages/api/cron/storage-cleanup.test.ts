import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

vi.mock('../../../lib/server/storage-cleanup-run', () => ({
    runStorageCleanup: async () => ({ deleted: 0, keys: [] }),
}));

const { GET } = await import('./storage-cleanup');

const call = (authorization?: string) =>
    GET({
        request: new Request('http://localhost/api/cron/storage-cleanup', {
            headers: authorization ? { authorization } : {},
        }),
    } as never) as Promise<Response>;

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/storage-cleanup', () => {
    it('answers 503 when CRON_SECRET is unset', async () => {
        vi.stubEnv('CRON_SECRET', '');
        expect((await call('Bearer anything')).status).toBe(503);
    });

    it('rejects a missing or wrong secret', async () => {
        vi.stubEnv('CRON_SECRET', 'right-secret-value');
        expect((await call()).status).toBe(401);
        expect((await call('Bearer wrong-secret-value')).status).toBe(401);
        expect((await call('right-secret-value')).status).toBe(401);
    });

    it('runs with the right secret, without listing keys', async () => {
        vi.stubEnv('CRON_SECRET', 'right-secret-value');
        const res = await call('Bearer right-secret-value');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(await res.json()).toEqual({ deleted: 0 });
    });
});
