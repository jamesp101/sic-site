import type { AstroCookies } from 'astro';

export type Flash = { type: 'success' | 'error'; message: string };

export const FLASH_COOKIE = 'sic_flash';
const MAX_MESSAGE = 300;

/** JSON payload for the flash cookie; the message is length-limited so the cookie stays tiny. */
export function encodeFlash(flash: Flash): string {
    return JSON.stringify({ type: flash.type, message: flash.message.slice(0, MAX_MESSAGE) });
}

/** Parses a flash cookie value; anything malformed yields null. */
export function decodeFlash(raw: string | undefined): Flash | null {
    if (!raw || raw.length > 2 * MAX_MESSAGE + 64) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== 'object' || value === null) return null;
        const { type, message } = value as Record<string, unknown>;
        if ((type !== 'success' && type !== 'error') || typeof message !== 'string' || !message) return null;
        return { type, message: message.slice(0, MAX_MESSAGE) };
    } catch {
        return null;
    }
}

/** Queues a toast for the next rendered admin/settings layout (short-lived httpOnly cookie, no server state). */
export function setFlash(cookies: AstroCookies, flash: Flash, secure: boolean): void {
    cookies.set(FLASH_COOKIE, encodeFlash(flash), {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60,
        secure,
    });
}

/** Reads and clears the queued toast. */
export function takeFlash(astro: { cookies: AstroCookies }): Flash | null {
    const cookie = astro.cookies.get(FLASH_COOKIE);
    if (!cookie) return null;
    astro.cookies.delete(FLASH_COOKIE, { path: '/' });
    return decodeFlash(cookie.value);
}
