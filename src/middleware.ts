import { defineMiddleware } from 'astro:middleware';
import { ANONYMOUS_CONTEXT, resolveRequestContext } from '@/lib/server/request-context';
import { STAFF_HINT_COOKIE, STAFF_HINT_MAX_AGE, staffHintAction } from '@/lib/staff-hint';
import { finishResponse } from '@/lib/server/http-edge';
import {
    anonymousActionResponse,
    isAssetPath,
    isScopedPath,
    loginRedirect,
    payloadTooLargeResponse,
    rejectsAnonymousAction,
    rejectsLargeAnonymousBody,
    responseHeaders,
} from '@/lib/server/request-policy';

/** Defined by `astro.config.mjs`: true for the Node adapter (Vercel compresses and conditions responses itself). */
declare const __NODE_SERVER__: boolean;
const edgeResponses = __NODE_SERVER__ && import.meta.env.PROD;

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const isAsset = isAssetPath(pathname);

    const request = isAsset
        ? ANONYMOUS_CONTEXT
        : await resolveRequestContext(context.request.headers, { scoped: isScopedPath(pathname) });
    context.locals.user = request.user;
    context.locals.session = request.session;
    context.locals.adminScope = request.adminScope;
    context.locals.adminDepartments = request.adminDepartments;

    // Before anything reads the body: a signed-out visitor never reaches an action (or its multipart parser),
    // and never makes the server take a large body.
    const signedIn = context.locals.user !== null;
    const rejected = rejectsAnonymousAction(context.request.method, context.url, signedIn)
        ? anonymousActionResponse()
        : rejectsLargeAnonymousBody(context.request.method, signedIn, context.request.headers.get('content-length'))
          ? payloadTooLargeResponse()
          : null;

    const redirect = loginRedirect(context.url, signedIn);
    if (redirect !== null) return context.redirect(redirect, 302);

    let response = rejected ?? (await next());

    const headers = responseHeaders({
        method: context.request.method,
        url: context.url,
        signedIn: context.locals.user !== null,
        siteIsHttps: context.site?.protocol === 'https:',
        hasCacheControl: response.headers.has('Cache-Control'),
        hasContentSecurityPolicy: response.headers.has('Content-Security-Policy'),
    });
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);

    // Value-free hint for scripts (the session cookie is httpOnly), decided on the final response: set or cleared
    // only on a no-store one, so a shared cache never stores a Set-Cookie.
    if (!isAsset) {
        const action = staffHintAction({
            signedIn,
            hinted: context.cookies.has(STAFF_HINT_COOKIE),
            cacheControl: response.headers.get('Cache-Control'),
        });
        if (action === 'set') {
            context.cookies.set(STAFF_HINT_COOKIE, '1', {
                path: '/',
                sameSite: 'lax',
                secure: context.site?.protocol === 'https:',
                maxAge: STAFF_HINT_MAX_AGE,
            });
        } else if (action === 'delete') context.cookies.delete(STAFF_HINT_COOKIE, { path: '/' });
    }
    if (edgeResponses)
        response = await finishResponse(response, { request: context.request, pathname: context.url.pathname });
    return response;
});
