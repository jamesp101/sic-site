/**
 * Faster admin navigation on top of Astro's ClientRouter (loaded once by AppLayout).
 *
 * 1. Intent prefetch: hovering, focusing or pressing an admin link fetches its HTML into a short-lived
 *    in-memory cache, and the router's loader uses that copy instead of fetching after the click.
 *    Admin responses are `no-store`, so Astro's built-in (HTTP-cache based) prefetch cannot help here.
 *    Freshness rules: only plain link clicks use the cache; form submissions and programmatic
 *    navigations (e.g. after a save) always fetch fresh and clear the cache.
 * 2. Progress bar: navigations slower than 120 ms show a thin bar at the top.
 */
import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';

const TTL_MS = 15_000;
const HOVER_DELAY_MS = 50;
const SECTION = /^\/(admin|dashboard|settings)(\/|$)/;

type Entry = { at: number; html: Promise<string | null> };
const cache = new Map<string, Entry>();

function cacheKey(url: URL): string {
    return url.pathname + url.search;
}

/** Admin URL of the link under `target`, or null when it should not be prefetched. */
function eligibleUrl(target: EventTarget | null): URL | null {
    const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.hasAttribute('data-astro-reload')) {
        return null;
    }
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || !SECTION.test(url.pathname)) return null;
    if (cacheKey(url) === cacheKey(new URL(location.href))) return null;
    return url;
}

function prefetch(url: URL): void {
    const key = cacheKey(url);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return;
    const html = fetch(url, { credentials: 'same-origin' })
        .then((res) =>
            // Never cache redirects (e.g. expired session) or non-HTML responses.
            res.ok && !res.redirected && res.headers.get('content-type')?.startsWith('text/html') ? res.text() : null,
        )
        .catch(() => null);
    cache.set(key, { at: Date.now(), html });
}

let hoverTimer: number | undefined;
document.addEventListener(
    'pointerover',
    (event) => {
        const url = eligibleUrl(event.target);
        window.clearTimeout(hoverTimer);
        if (url) hoverTimer = window.setTimeout(() => prefetch(url), HOVER_DELAY_MS);
    },
    { passive: true },
);
for (const type of ['focusin', 'pointerdown'] as const) {
    document.addEventListener(
        type,
        (event) => {
            // A press/focus supersedes the debounced hover so the same page is not fetched twice.
            window.clearTimeout(hoverTimer);
            const url = eligibleUrl(event.target);
            if (url) prefetch(url);
        },
        { passive: true },
    );
}
// Any form submission may change data: drop everything prefetched so far.
document.addEventListener('submit', () => cache.clear(), true);

document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
    window.clearTimeout(hoverTimer);
    const fromLink = event.sourceElement instanceof HTMLAnchorElement && !event.formData;
    if (!fromLink) {
        // Programmatic navigate()/reloadView() after a mutation, back/forward, or a form: fetch fresh.
        if (event.navigationType !== 'traverse') cache.clear();
        return;
    }
    const key = cacheKey(event.to);
    const entry = cache.get(key);
    cache.delete(key);
    if (!entry || Date.now() - entry.at >= TTL_MS) return;

    const defaultLoader = event.loader;
    event.loader = async () => {
        const html = await entry.html;
        if (html === null || event.signal.aborted) return defaultLoader();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Same post-processing as Astro's default loader.
        doc.querySelectorAll('noscript').forEach((el) => el.remove());
        if (!doc.querySelector('[name="astro-view-transitions-enabled"]')) return defaultLoader();
        event.newDocument = doc;
    };
});

// Progress bar, attached to <html> so body swaps do not remove it.
const bar = document.createElement('div');
bar.setAttribute('aria-hidden', 'true');
bar.className =
    'pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 origin-left scale-x-0 bg-gold-500 opacity-0 transition-[transform,opacity] duration-300 ease-out';
document.documentElement.append(bar);
let barTimer: number | undefined;

document.addEventListener('astro:before-preparation', () => {
    window.clearTimeout(barTimer);
    barTimer = window.setTimeout(() => {
        bar.style.opacity = '1';
        bar.style.transform = 'scaleX(0.7)';
    }, 120);
});
document.addEventListener('astro:after-swap', () => {
    window.clearTimeout(barTimer);
    if (bar.style.opacity !== '1') return;
    bar.style.transform = 'scaleX(1)';
    setTimeout(() => {
        bar.style.opacity = '0';
        bar.style.transform = 'scaleX(0)';
    }, 200);
});
