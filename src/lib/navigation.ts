import { navigate } from 'astro:transitions/client';

/**
 * Re-fetches the current view (fresh server data + any queued flash toast) through the
 * ClientRouter instead of a full page reload. Falls back to a full load where the router is absent.
 */
export function reloadView(): Promise<void> {
    return navigate(location.pathname + location.search, { history: 'replace' });
}
