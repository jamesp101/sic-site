/** Accepts only same-origin relative paths (`/foo?bar`); anything else falls back. */
export function safeRedirect(value: string | null | undefined, fallback = '/dashboard'): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
    if (/\p{Cc}/u.test(value)) return fallback;
    return value;
}
