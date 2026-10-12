/** Fixed locale and zone so server-rendered and client-rendered text are identical. */
const LOCALE = 'en-PH';
const TIME_ZONE = 'Asia/Manila';

export interface FormatDateOptions {
    /** Include the time of day. */
    time?: boolean;
    /** Use abbreviated month names. */
    short?: boolean;
}

function toDate(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function dateFormat(opts: FormatDateOptions = {}): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(LOCALE, {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: opts.short ? 'short' : 'long',
        day: 'numeric',
        ...(opts.time ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
}

export function formatDate(date: Date | string, opts: FormatDateOptions = {}): string {
    const value = toDate(date);
    return Number.isNaN(value.getTime()) ? '' : dateFormat(opts).format(value);
}

/** "August 15 – 20, 2026" style ranges; falls back to one date when end is missing or the same day. */
export function formatDateRange(
    start: Date | string | null,
    end?: Date | string | null,
    opts: FormatDateOptions = {},
): string {
    if (!start) return end ? formatDate(end, opts) : '';
    if (!end) return formatDate(start, opts);
    const from = toDate(start);
    const to = toDate(end);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return formatDate(start, opts);

    const format = dateFormat(opts);
    const first = format.format(from);
    const last = format.format(to);
    if (first === last) return first;
    if (opts.time) return `${first} – ${last}`;
    return format.formatRange(from, to);
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
    const value = bytes / 1024 ** exponent;
    const rounded = exponent === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded} ${UNITS[exponent]}`;
}
