/** Event block dates: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`, local school time without a zone. Formatting is locale/zone independent. */

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const MONTHS = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
];

export interface EventDate {
    year: number;
    month: number;
    day: number;
    /** `null` for date-only values. */
    hour: number | null;
    minute: number | null;
    /** Original, normalised string usable as `<time datetime>`. */
    iso: string;
}

export function parseEventDate(value: unknown): EventDate | null {
    if (typeof value !== 'string') return null;
    const match = PATTERN.exec(value.trim());
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const hasTime = match[4] !== undefined;
    const [hour, minute] = hasTime ? [Number(match[4]), Number(match[5])] : [null, null];
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
    if (hour !== null && (hour > 23 || minute! > 59)) return null;
    return { year, month, day, hour, minute, iso: value.trim() };
}

export function formatEventDay(date: EventDate): string {
    return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

export function formatEventTime(date: EventDate): string {
    if (date.hour === null || date.minute === null) return '';
    const suffix = date.hour >= 12 ? 'PM' : 'AM';
    const hour = date.hour % 12 === 0 ? 12 : date.hour % 12;
    return `${hour}:${String(date.minute).padStart(2, '0')} ${suffix}`;
}

/** Sortable number for comparing two parsed dates. */
export function eventDateKey(date: EventDate): number {
    return Date.UTC(date.year, date.month - 1, date.day, date.hour ?? 0, date.minute ?? 0);
}
