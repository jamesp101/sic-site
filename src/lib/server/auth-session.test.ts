import { describe, expect, it, vi } from 'vite-plus/test';

vi.mock('./auth', () => ({ auth: {}, CLIENT_IP_HEADER: 'x-sic-client-ip' }));

const { currentSessionId, signInFailure } = await import('./auth-session');

describe('signInFailure', () => {
    it('answers 429 when Better Auth rate limits the sign-in', () => {
        expect(signInFailure(429)).toMatchObject({
            status: 429,
            message: expect.stringContaining('Too many attempts'),
        });
    });

    it('answers 422 with one message for any other failure, so it does not reveal which part was wrong', () => {
        for (const status of [400, 401, 403, 500]) {
            expect(signInFailure(status)).toEqual({
                status: 422,
                message: 'These credentials do not match our records.',
            });
        }
    });
});

describe('currentSessionId', () => {
    it('is the numeric session id, or null without a session', () => {
        expect(currentSessionId({ id: '42' })).toBe(42);
        expect(currentSessionId(null)).toBeNull();
        expect(currentSessionId(undefined)).toBeNull();
    });
});
