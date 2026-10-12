/** URL filtering shared by the validator and the renderer. Returns `null` for anything unsafe. */

// eslint-disable-next-line no-control-regex
const CONTROL_OR_SPACE = /[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const LINK_SCHEMES: Record<string, true> = { http: true, https: true, mailto: true, tel: true };
const IMAGE_SCHEMES: Record<string, true> = { http: true, https: true };

function filter(url: unknown, schemes: Record<string, true>): string | null {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;
    // Browsers strip tabs/newlines/zero-width characters inside schemes, so test the stripped form.
    const probe = trimmed.replace(CONTROL_OR_SPACE, '');
    if (/^(?:\/\/|\\|\/\\)/.test(probe)) return null;
    const scheme = SCHEME.exec(probe);
    if (scheme) return schemes[scheme[1].toLowerCase()] === true ? trimmed : null;
    // No scheme: only an absolute path, a relative path or a fragment/query is accepted.
    return /[:]/.test(probe.split(/[/?#]/)[0]) ? null : trimmed;
}

/** Link target: http(s), mailto, tel, site-relative paths and `#fragments`. */
export function safeHref(url: unknown): string | null {
    return filter(url, LINK_SCHEMES);
}

/** Image source: http(s) or a site-relative path (uploads live under `/storage/…`). */
export function safeImageSrc(url: unknown): string | null {
    return filter(url, IMAGE_SCHEMES);
}

/** Whether a (safe) href leaves this site and should open with `rel="noopener noreferrer"`. */
export function isExternalHref(href: string): boolean {
    return /^https?:\/\//i.test(href);
}

export interface VideoSource {
    provider: 'youtube' | 'vimeo';
    id: string;
    /** Privacy-friendly iframe URL (youtube-nocookie / Vimeo `dnt=1`). */
    embedUrl: string;
}

const YOUTUBE_HOSTS: Record<string, true> = {
    'youtube.com': true,
    'www.youtube.com': true,
    'm.youtube.com': true,
    'youtube-nocookie.com': true,
    'www.youtube-nocookie.com': true,
};
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;

/** Accepts only YouTube / Vimeo page or embed URLs; everything else is rejected. */
export function parseVideoUrl(raw: unknown): VideoSource | null {
    if (typeof raw !== 'string') return null;
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);

    let youtube: string | null = null;
    if (host === 'youtu.be') youtube = parts[0] ?? null;
    else if (YOUTUBE_HOSTS[host] === true) {
        if (parts[0] === 'watch') youtube = url.searchParams.get('v');
        else if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') youtube = parts[1] ?? null;
    }
    if (youtube && YOUTUBE_ID.test(youtube)) {
        return { provider: 'youtube', id: youtube, embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}` };
    }

    if (host === 'vimeo.com' || host === 'www.vimeo.com' || host === 'player.vimeo.com') {
        const id = host === 'player.vimeo.com' ? (parts[0] === 'video' ? parts[1] : undefined) : parts[0];
        if (id && VIMEO_ID.test(id)) {
            return { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}?dnt=1` };
        }
    }
    return null;
}
