/** The value of cookie `name` in a `Cookie` header / `document.cookie` string (URI-decoded when it can be), else undefined. Free of `astro:*`; shared by the server and the browser scripts. */
export function cookieValue(cookieHeader: string | null | undefined, name: string): string | undefined {
    for (const part of (cookieHeader ?? '').split(';')) {
        const separator = part.indexOf('=');
        if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
        const raw = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return undefined;
}
