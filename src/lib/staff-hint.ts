/**
 * `sic_staff`: a JS-readable presence hint for a signed-in browser. Better Auth's session cookie is httpOnly,
 * so a script cannot see it; the middleware mirrors its presence into this value-free cookie (set while a
 * session exists, deleted once a private response shows there is none). Anonymous HTML may be served from
 * a shared cache to a signed-in person, so the public prefetch script reads it to stay quiet for them.
 * It carries no identity and grants nothing.
 */
export const STAFF_HINT_COOKIE = 'sic_staff';
export const STAFF_HINT_MAX_AGE = 60 * 60 * 24 * 7;

/** Whether a `document.cookie` / `Cookie` header string carries the hint. */
export function hasStaffHint(cookieHeader: string): boolean {
    return cookieHeader.split(';').some((part) => part.trim().startsWith(`${STAFF_HINT_COOKIE}=`));
}
