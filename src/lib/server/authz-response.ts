import { AuthzError } from './authz';

/** Maps an AuthzError thrown while rendering an admin page to its HTTP response; rethrows anything else. */
export function authzResponse(error: unknown): Response {
    if (error instanceof AuthzError) return new Response(error.message, { status: error.status });
    throw error;
}

/** Parses a numeric route segment; returns null for anything that is not a positive integer. */
export function parseId(value: string | undefined): number | null {
    return value && /^\d+$/.test(value) ? Number(value) : null;
}
