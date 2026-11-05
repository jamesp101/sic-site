/**
 * The one rule for "this click or hover is about a plain navigation": a same-origin link without a foreign
 * `target` or `download`, that points at another document (not just another `#hash` of this one). Used by
 * the admin intent prefetch, the public hover prefetch and the unsaved-changes guard.
 */
export interface LinkFacts {
    href: string;
    target: string;
    download: boolean;
}

/** The link's URL when it is a plain link to another document of `here`'s origin, else null. */
export function plainLinkUrl(link: LinkFacts, here: URL): URL | null {
    if ((link.target && link.target !== '_self') || link.download) return null;
    const url = new URL(link.href, here);
    if (url.origin !== here.origin) return null;
    if (url.pathname === here.pathname && url.search === here.search) return null;
    return url;
}

/** `plainLinkUrl` for the link under an event target (browser only). */
export function plainLinkAt(target: EventTarget | null, here: URL = new URL(location.href)): URL | null {
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor) return null;
    return plainLinkUrl({ href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') }, here);
}
