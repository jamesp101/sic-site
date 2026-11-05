/**
 * Reading, signing in, signing out and naming the current session, in one place: `auth.api` is called
 * only here (and Better Auth's own handler mount, `pages/api/auth/[...all].ts`). Everything goes through
 * Better Auth's own router/API, so its rate limit and cookies apply. Free of `astro:*` imports.
 */
import { auth, CLIENT_IP_HEADER } from './auth';

/** The session (and its user) the request's cookie names, or null. The middleware reads it once per request. */
export function getSession(headers: Headers) {
    return auth.api.getSession({ headers });
}

export type SignInResult = { ok: true; setCookies: string[] } | { ok: false; status: 422 | 429; message: string };

/** The failed sign-in answer for Better Auth's response status: 429 when rate limited, else 422. */
export function signInFailure(status: number): { status: 422 | 429; message: string } {
    return status === 429
        ? { status: 429, message: 'Too many attempts. Please wait a few minutes and try again.' }
        : { status: 422, message: 'These credentials do not match our records.' };
}

export interface SignInRequest {
    /** The incoming request: its cookie and user agent are forwarded. */
    request: Request;
    /** The URL the form was posted to (origin for Better Auth's origin check, base for its endpoint). */
    url: URL;
    clientAddress: string;
    email: string;
    password: string;
    remember: boolean;
}

/** Signs in with email and password. On success, `setCookies` are the Set-Cookie headers to send back. */
export async function signIn(input: SignInRequest): Promise<SignInResult> {
    const headers = new Headers({
        'content-type': 'application/json',
        origin: input.url.origin,
        cookie: input.request.headers.get('cookie') ?? '',
        'user-agent': input.request.headers.get('user-agent') ?? '',
        [CLIENT_IP_HEADER]: input.clientAddress,
    });
    const res = await auth.handler(
        new Request(new URL('/api/auth/sign-in/email', input.url), {
            method: 'POST',
            headers,
            body: JSON.stringify({ email: input.email, password: input.password, rememberMe: input.remember }),
        }),
    );
    if (res.ok) return { ok: true, setCookies: res.headers.getSetCookie() };
    return { ok: false, ...signInFailure(res.status) };
}

/** Signs out the session in `headers`; returns the names of the cookies Better Auth cleared. */
export async function signOut(headers: Headers): Promise<string[]> {
    const { headers: out } = await auth.api.signOut({ headers, returnHeaders: true });
    return out
        .getSetCookie()
        .map((cookie) => cookie.slice(0, cookie.indexOf('=')).trim())
        .filter(Boolean);
}

/** The id of the signed-in request's session (`Astro.locals.session`), as the number the database uses. */
export function currentSessionId(session: { id: string | number } | null | undefined): number | null {
    return session ? Number(session.id) : null;
}
