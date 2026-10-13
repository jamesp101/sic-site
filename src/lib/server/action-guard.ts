import { ActionError, type ActionAPIContext } from 'astro:actions';
import { AuthzError, type Actor } from './authz';
import { setFlash } from './flash';

type ActionCode = ConstructorParameters<typeof ActionError>[0]['code'];

/** Runs `fn` and maps AuthzError to ActionError so clients get 401/403/404. */
export async function guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof AuthzError)
            throw new ActionError({ code: error.code as ActionCode, message: error.message });
        throw error;
    }
}

/** Current actor from middleware-populated locals; throws UNAUTHORIZED when signed out. */
export function actorOf(context: ActionAPIContext): Actor & NonNullable<App.Locals['user']> {
    const user = context.locals.user;
    if (!user) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Sign in required.' });
    return user;
}

/** Queues a toast shown by the next rendered admin/settings layout. */
export function flash(context: ActionAPIContext, message: string, type: 'success' | 'error' = 'success'): void {
    setFlash(context.cookies, { type, message }, context.url.protocol === 'https:');
}
