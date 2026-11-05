/** Pure request policy: route classes, sign-in guard and response headers. No Astro imports. */

const PROTECTED = [
    /^\/dashboard(\/|$)/,
    /^\/admin(\/|$)/,
    /^\/settings(\/|$)/,
    /^\/confirm-password$/,
    /^\/verify-email$/,
];
const SCOPED = [/^\/dashboard(\/|$)/, /^\/admin(\/|$)/, /^\/settings(\/|$)/];
const PRIVATE = [
    ...PROTECTED,
    /^\/api\//,
    /^\/_actions(\/|$)/,
    /^\/login$/,
    /^\/forgot-password$/,
    /^\/reset-password$/,
];

const matches = (list: RegExp[], pathname: string) => list.some((re) => re.test(pathname));

/** Static assets: no session, no Cache-Control from the policy. */
export const isAssetPath = (pathname: string) => pathname.startsWith('/_astro/') || pathname.startsWith('/storage/');

/**
 * A public HTML page: not private, not an asset, not a feed. Anonymous responses for these are cacheable
 * (`PUBLIC_CACHE_CONTROL`), so the public hover prefetch (`src/scripts/public-prefetch.ts`) only targets them.
 */
export const isPublicPage = (pathname: string) =>
    !matches(PRIVATE, pathname) && !isAssetPath(pathname) && !pathname.endsWith('.xml');

/**
 * Directives that hold for every response. Pages rendered by Astro send them through `security.csp.directives`
 * (`astro.config.mjs`, together with the `script-src` hashes Astro computes); every other response (API, endpoints,
 * redirects, errors) gets them from `responseHeaders`.
 */
export const BASE_CSP_DIRECTIVES = [
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
] as const;

/** Actions (`src/actions/index.ts`) a signed-out visitor may call; every other action needs a session. */
const PUBLIC_ACTIONS = ['contact.send'];

/** Astro action calls: `POST /_actions/<name>` (the JS client) and `POST <page>?_action=<name>` (no-JS forms). */
const ACTION_RPC_PREFIX = '/_actions/';
const ACTION_FORM_PARAM = '_action';

/**
 * True for an action call from a signed-out visitor that is not a public action. The middleware answers it
 * before Astro reads the request body, so anonymous clients cannot make the server buffer or parse uploads.
 */
export function rejectsAnonymousAction(method: string, url: URL, signedIn: boolean): boolean {
    if (signedIn) return false;
    const { pathname } = url;
    if (pathname === '/_actions' || pathname.startsWith(ACTION_RPC_PREFIX)) {
        const name = pathname.slice(ACTION_RPC_PREFIX.length).replace(/\/$/, '');
        return !PUBLIC_ACTIONS.includes(name);
    }
    if (method === 'GET' || method === 'HEAD') return false;
    const formName = url.searchParams.get(ACTION_FORM_PARAM);
    return formName !== null && !PUBLIC_ACTIONS.includes(formName);
}

/** The 401 `rejectsAnonymousAction` is answered with: the body Astro's own action client turns into an `ActionError`. */
export function anonymousActionResponse(): Response {
    return new Response(
        JSON.stringify({ type: 'AstroActionError', code: 'UNAUTHORIZED', status: 401, message: 'Sign in required.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
}

/** Largest body a signed-out visitor may send: the contact form, the login form and Better Auth's JSON calls are far below it. */
export const ANONYMOUS_BODY_LIMIT = 64 * 1024;

/**
 * True for a signed-out request that can carry a body (anything but GET/HEAD) and does not declare a
 * `Content-Length` of at most `ANONYMOUS_BODY_LIMIT` bytes (missing, malformed or larger). Every upload route and
 * every signed-in action needs a session, so nothing a signed-out visitor legitimately sends is exempt. The
 * middleware answers it with 413 before anything reads the body.
 */
export function rejectsLargeAnonymousBody(method: string, signedIn: boolean, contentLength: string | null): boolean {
    if (signedIn || method === 'GET' || method === 'HEAD') return false;
    if (contentLength === null || !/^\d+$/.test(contentLength)) return true;
    return Number(contentLength) > ANONYMOUS_BODY_LIMIT;
}

/** The 413 `rejectsLargeAnonymousBody` is answered with. */
export function payloadTooLargeResponse(): Response {
    return new Response('Request body too large.', { status: 413, headers: { 'Content-Type': 'text/plain' } });
}

/** An Admin-scoped route (`/dashboard`, `/admin`, `/settings`): its request context carries the Admin scope. */
export const isScopedPath = (pathname: string) => matches(SCOPED, pathname);

/** Before rendering: where to send an anonymous visitor of a protected route (login, keeping the target), else null. */
export function loginRedirect(url: URL, signedIn: boolean): string | null {
    const { pathname } = url;
    if (signedIn || !matches(PROTECTED, pathname)) return null;
    return `/login?redirect=${encodeURIComponent(pathname + url.search)}`;
}

export interface ResponsePolicyInput {
    method: string;
    url: URL;
    signedIn: boolean;
    /** `SITE_URL` is https: HSTS is sent even when a TLS-terminating proxy makes the request look like http. */
    siteIsHttps: boolean;
    /** The response already carries its own Cache-Control. */
    hasCacheControl: boolean;
    /** The response already carries its own Content-Security-Policy. */
    hasContentSecurityPolicy: boolean;
}

/** Cacheable public pages: browsers and shared caches keep them 60 s, caches may serve a stale copy for 10 minutes while revalidating. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';

/** Headers to set on the response (override any existing value). */
export function responseHeaders(input: ResponsePolicyInput): Record<string, string> {
    const { pathname, protocol } = input.url;
    const headers: Record<string, string> = {};

    if (!input.hasCacheControl && !isAssetPath(pathname)) {
        const isPrivate = matches(PRIVATE, pathname) || input.signedIn || input.method !== 'GET';
        headers['Cache-Control'] = isPrivate ? 'no-store' : PUBLIC_CACHE_CONTROL;
    }
    if (matches(PRIVATE, pathname)) headers['X-Robots-Tag'] = 'noindex, nofollow';

    // No page may be framed. /storage sets its own per-type policy (PDFs must stay viewable).
    if (!pathname.startsWith('/storage/') && !input.hasContentSecurityPolicy) {
        headers['Content-Security-Policy'] = BASE_CSP_DIRECTIVES.join('; ');
    }
    headers['X-Frame-Options'] = 'DENY';
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    if (protocol === 'https:' || input.siteIsHttps) {
        headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return headers;
}
