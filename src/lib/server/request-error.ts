/**
 * A rejected request that is the caller's fault (bad input, rate limit). Free of `astro:*` imports so
 * server modules can throw it; `guarded()` turns it into an ActionError and `adminRoute()` into a JSON response.
 */
export class RequestError extends Error {
    constructor(
        readonly code: 'BAD_REQUEST' | 'TOO_MANY_REQUESTS',
        message: string,
    ) {
        super(message);
        this.name = 'RequestError';
    }

    get status(): number {
        return this.code === 'BAD_REQUEST' ? 400 : 429;
    }
}
