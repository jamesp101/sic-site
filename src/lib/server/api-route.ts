/**
 * The API-route adapter for `/api/admin/**`: JSON responses and sign-in / error handling.
 * Free of `astro:*` imports.
 */
import type { APIRoute } from 'astro';
import { requireUser, type Actor } from './authz';
import { RequestError } from './request-error';

export const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Wraps a signed-in route: signed out → 401. A RequestError thrown by the handler (or anything it calls)
 * becomes `{ message }` with its status; routes never build their own error responses.
 */
export function adminRoute(
    handler: (context: { request: Request; user: NonNullable<App.Locals['user']> & Actor }) => Promise<Response>,
): APIRoute {
    return async ({ request, locals }) => {
        try {
            return await handler({ request, user: requireUser(locals.user) });
        } catch (error) {
            if (!(error instanceof RequestError)) throw error;
            return json({ message: error.message }, error.status);
        }
    };
}
