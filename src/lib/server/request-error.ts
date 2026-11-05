/**
 * The one failure a server module throws for a rejected request (bad input, not signed in, not allowed,
 * missing row, conflict, rate limit). Free of `astro:*` imports so any server module can throw it; each
 * entry point has one adapter: `guarded()` (actions), `adminRoute()` (API routes), `adminPage()` (pages).
 */
export type RequestErrorCode =
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'UNPROCESSABLE_CONTENT'
    | 'TOO_MANY_REQUESTS';

const STATUS: Record<RequestErrorCode, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_CONTENT: 422,
    TOO_MANY_REQUESTS: 429,
};

const DEFAULT_MESSAGE: Partial<Record<RequestErrorCode, string>> = {
    UNAUTHORIZED: 'Sign in required.',
    FORBIDDEN: 'Forbidden.',
    NOT_FOUND: 'Not found.',
};

export class RequestError extends Error {
    constructor(
        readonly code: RequestErrorCode,
        message: string = DEFAULT_MESSAGE[code] ?? 'Bad request.',
    ) {
        super(message);
        this.name = 'RequestError';
    }

    get status(): number {
        return STATUS[this.code];
    }
}
