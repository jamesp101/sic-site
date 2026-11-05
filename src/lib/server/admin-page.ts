/**
 * The page adapter for admin, settings and dashboard pages. Free of `astro:*` imports.
 *
 *   const page = await adminPage(Astro.locals.user, { load: (actor) => loadScoped(actor, 'post', parseId(Astro.params.id)) });
 *   if (page instanceof Response) return page;
 *   const { actor, row } = page;
 */
import { requireSuperAdmin, requireUser, type Actor } from './authz';
import { RequestError } from './request-error';

export interface AdminPageOptions<Row> {
    /** Only superadmins may open the page. */
    superAdmin?: boolean;
    /** Loads the page's scoped row; throw RequestError (NOT_FOUND / FORBIDDEN) when the actor may not see it. */
    load?: (actor: Actor) => Row | Promise<Row>;
}

/**
 * Resolves the signed-in actor (and the scoped row, if `load` is given) or returns the error Response
 * (401/403/404, text body = the message) for the page to return as is. Other errors propagate.
 */
export async function adminPage<U extends Actor, Row = undefined>(
    user: U | null | undefined,
    options: AdminPageOptions<Row> = {},
): Promise<{ actor: U; row: Row } | Response> {
    try {
        const actor = options.superAdmin ? requireSuperAdmin(user) : requireUser(user);
        return { actor, row: (await options.load?.(actor)) as Row };
    } catch (error) {
        if (error instanceof RequestError) return new Response(error.message, { status: error.status });
        throw error;
    }
}

/** Parses a numeric route segment; returns null for anything that is not a positive integer. */
export function parseId(value: string | undefined): number | null {
    return value && /^\d+$/.test(value) ? Number(value) : null;
}
