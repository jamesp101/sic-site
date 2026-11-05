/**
 * Shared plumbing for `/api/admin/**` routes: JSON responses and sign-in / error handling.
 * Free of `astro:*` imports.
 */
import type { APIRoute } from 'astro';
import { AuthzError, requireUser, type Actor } from './authz';
import { RequestError } from './request-error';

export const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Wraps a signed-in route: unauthenticated → 401, AuthzError / RequestError → `{ message }` with their status. */
export function adminRoute(
    handler: (context: { request: Request; user: NonNullable<App.Locals['user']> & Actor }) => Promise<Response>,
): APIRoute {
    return async ({ request, locals }) => {
        try {
            return await handler({ request, user: requireUser(locals.user) });
        } catch (error) {
            if (error instanceof AuthzError || error instanceof RequestError) {
                return json({ message: error.message }, error.status);
            }
            throw error;
        }
    };
}
