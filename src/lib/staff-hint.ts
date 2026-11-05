import { cookieValue } from './cookie-header';

/**
 * `sic_staff`: a JS-readable presence hint for a signed-in browser. Better Auth's session cookie is httpOnly,
 * so a script cannot see it; the middleware mirrors its presence into this value-free cookie (set while a
 * session exists, deleted once a private response shows there is none; `staffHintAction` decides from the final response). Anonymous HTML may be served from
 * a shared cache to a signed-in person, so the public prefetch script reads it to stay quiet for them.
 * It carries no identity and grants nothing.
 */
export const STAFF_HINT_COOKIE = 'sic_staff';
export const STAFF_HINT_MAX_AGE = 60 * 60 * 24 * 7;

/** Whether a `document.cookie` / `Cookie` header string carries the hint. */
export function hasStaffHint(cookieHeader: string): boolean {
    return cookieValue(cookieHeader, STAFF_HINT_COOKIE) !== undefined;
}

/**
 * What the middleware does with the hint once the response is final: `set` for a signed-in person without it,
 * `delete` for a signed-out one who still has it, and only when the response is `no-store`: a shared cache must
 * never store a `Set-Cookie` that belongs to one visitor.
 */
export function staffHintAction(input: {
    signedIn: boolean;
    hinted: boolean;
    cacheControl: string | null;
}): 'set' | 'delete' | null {
    if (!/(^|[\s,])no-store\b/i.test(input.cacheControl ?? '')) return null;
    if (input.signedIn && !input.hinted) return 'set';
    return !input.signedIn && input.hinted ? 'delete' : null;
}
