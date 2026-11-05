import { ActionError, type ActionAPIContext } from 'astro:actions';
import type { Actor } from './authz';
import { setFlash } from './flash';
import { RequestError } from './request-error';

/** The action adapter: runs `fn` and turns a RequestError into the ActionError with the same code. Other errors propagate. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof RequestError) throw new ActionError({ code: error.code, message: error.message });
        throw error;
    }
}

/** Current actor from middleware-populated locals; throws UNAUTHORIZED when signed out. */
export function actorOf(context: ActionAPIContext): Actor & NonNullable<App.Locals['user']> {
    const user = context.locals.user;
    if (!user) throw new RequestError('UNAUTHORIZED');
    return user;
}

/** Queues a toast shown by the next rendered admin/settings layout. */
export function flash(context: ActionAPIContext, message: string, type: 'success' | 'error' = 'success'): void {
    setFlash(context.cookies, { type, message }, context.url.protocol === 'https:');
}
