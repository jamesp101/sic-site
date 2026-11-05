/** Pure request policy: route classes, sign-in guard and response headers. No Astro imports. */

const PROTECTED = [
    /^\/dashboard(\/|$)/,
    /^\/admin(\/|$)/,
    /^\/settings(\/|$)/,
    /^\/confirm-password$/,
    /^\/verify-email$/,
];
const SCOPED = [/^\/dashboard(\/|$)/, /^\/admin(\/|$)/, /^\/settings(\/|$)/];
const PRIVATE = [...PROTECTED, /^\/api\//, /^\/login$/, /^\/forgot-password$/, /^\/reset-password$/];

const matches = (list: RegExp[], pathname: string) => list.some((re) => re.test(pathname));

/** Static assets: no session, no Cache-Control from the policy. */
export const isAssetPath = (pathname: string) => pathname.startsWith('/_astro/') || pathname.startsWith('/storage/');

export type RequestGuard = { redirect: string } | { redirect: null; scoped: boolean };

/** Before rendering: send anonymous visitors of protected routes to login; flag Admin-scoped routes. */
export function guardRequest(url: URL, signedIn: boolean): RequestGuard {
    const { pathname } = url;
    if (!signedIn && matches(PROTECTED, pathname)) {
        return { redirect: `/login?redirect=${encodeURIComponent(pathname + url.search)}` };
    }
    return { redirect: null, scoped: signedIn && matches(SCOPED, pathname) };
}

export interface ResponsePolicyInput {
    method: string;
    url: URL;
    signedIn: boolean;
    /** The response already carries its own Cache-Control. */
    hasCacheControl: boolean;
    /** The response already carries its own Content-Security-Policy. */
    hasContentSecurityPolicy: boolean;
}

/** Headers to set on the response (override any existing value). */
export function responseHeaders(input: ResponsePolicyInput): Record<string, string> {
    const { pathname, protocol } = input.url;
    const headers: Record<string, string> = {};

    if (!input.hasCacheControl && !isAssetPath(pathname)) {
        const isPrivate = matches(PRIVATE, pathname) || input.signedIn || input.method !== 'GET';
        headers['Cache-Control'] = isPrivate ? 'no-store' : 'public, max-age=60, stale-while-revalidate=600';
    }
    if (matches(PRIVATE, pathname)) headers['X-Robots-Tag'] = 'noindex, nofollow';

    // No page may be framed. /storage sets its own per-type policy (PDFs must stay viewable).
    if (!pathname.startsWith('/storage/') && !input.hasContentSecurityPolicy) {
        headers['Content-Security-Policy'] =
            "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
    }
    headers['X-Frame-Options'] = 'DENY';
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    if (protocol === 'https:') headers['Strict-Transport-Security'] = 'max-age=31536000';
    return headers;
}
