import type { AstroGlobal } from 'astro';

/** Reads and clears the queued toast (see action-guard.flash). */
export async function takeFlash(astro: AstroGlobal): Promise<App.SessionData['flash'] | null> {
    const value = await astro.session?.get('flash');
    if (value) astro.session?.delete('flash');
    return value ?? null;
}
