/**
 * Hover prefetch for the public site: pointing at, focusing or touching a link to a public page loads that
 * page in the background, so the click shows it from the HTTP cache. Anonymous public pages are sent with
 * `PUBLIC_CACHE_CONTROL` (max-age=60), which is what lets the prefetched copy be reused; signed-in visitors get
 * `no-store`, so `PublicLayout` only loads this script for anonymous visitors. Astro's `prefetch` skips
 * duplicates and visitors on Save-Data or slow connections. The admin has its own (`admin-navigation.ts`).
 */
import { prefetch } from 'astro:prefetch';
import { isPublicPage } from '@/lib/server/request-policy';

/** A pointer passing over a link on its way elsewhere should not fetch it. */
const HOVER_DELAY_MS = 65;

function publicPageUrl(target: EventTarget | null): string | null {
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return null;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || url.searchParams.has('download') || !isPublicPage(url.pathname)) {
        return null;
    }
    // Same document (only the #hash differs): nothing to load.
    if (url.pathname === location.pathname && url.search === location.search) return null;
    return url.href;
}

let pending: { anchor: Element; timer: number } | null = null;

document.addEventListener(
    'mouseover',
    (event) => {
        const href = publicPageUrl(event.target);
        const anchor = href && (event.target as Element).closest('a');
        if (!href || !anchor || pending?.anchor === anchor) return;
        if (pending) clearTimeout(pending.timer);
        pending = { anchor, timer: window.setTimeout(() => prefetch(href), HOVER_DELAY_MS) };
    },
    { passive: true },
);

document.addEventListener(
    'mouseout',
    (event) => {
        if (pending && !pending.anchor.contains(event.relatedTarget as Node | null)) {
            clearTimeout(pending.timer);
            pending = null;
        }
    },
    { passive: true },
);

// Keyboard and touch show intent immediately.
for (const type of ['focusin', 'touchstart'] as const) {
    document.addEventListener(
        type,
        (event) => {
            const href = publicPageUrl(event.target);
            if (href) prefetch(href);
        },
        { passive: true },
    );
}
