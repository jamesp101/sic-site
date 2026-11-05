import { describe, expect, it } from 'vite-plus/test';
import { createBlock } from './document';
import { eventDateKey, formatEventDay, formatEventTime, parseEventDate, type EventDate } from './event-date';
import { renderBlocks } from './render';

const parse = (value: string): EventDate => {
    const date = parseEventDate(value);
    if (!date) throw new Error(`expected ${value} to parse`);
    return date;
};

describe('event date: parsing', () => {
    it('reads a date-only start without a time', () => {
        expect(parseEventDate('2026-08-15')).toEqual({
            year: 2026,
            month: 8,
            day: 15,
            hour: null,
            minute: null,
            iso: '2026-08-15',
        });
    });

    it('reads a start with a time', () => {
        expect(parseEventDate('2026-08-15T08:30')).toEqual({
            year: 2026,
            month: 8,
            day: 15,
            hour: 8,
            minute: 30,
            iso: '2026-08-15T08:30',
        });
    });

    it('trims surrounding whitespace and exposes the trimmed value as the machine-readable datetime', () => {
        expect(parseEventDate('  2026-08-15T08:30 ')?.iso).toBe('2026-08-15T08:30');
    });

    it('accepts the first and last minute of the day and a leap day', () => {
        expect(parseEventDate('2026-08-15T00:00')).toMatchObject({ hour: 0, minute: 0 });
        expect(parseEventDate('2026-08-15T23:59')).toMatchObject({ hour: 23, minute: 59 });
        expect(parseEventDate('2028-02-29')).toMatchObject({ month: 2, day: 29 });
    });

    it.each([
        ['empty string', ''],
        ['blank string', '   '],
        ['free text', 'soon'],
        ['day-first order', '15-08-2026'],
        ['an impossible day', '2026-02-30'],
        ['a leap day in a common year', '2027-02-29'],
        ['month 13', '2026-13-01'],
        ['month 00', '2026-00-10'],
        ['hour 24', '2026-08-15T24:00'],
        ['minute 60', '2026-08-15T08:60'],
        ['a time with seconds', '2026-08-15T08:00:00'],
        ['a zone suffix', '2026-08-15T08:00Z'],
        ['a space instead of T', '2026-08-15 08:00'],
    ])('rejects %s', (_label, value) => {
        expect(parseEventDate(value)).toBeNull();
    });

    it.each([[undefined], [null], [20260815], [{}]])('rejects the non-string input %j', (value) => {
        expect(parseEventDate(value)).toBeNull();
    });
});

describe('event date: formatting', () => {
    it('writes the day as month name, day and year', () => {
        expect(formatEventDay(parse('2026-08-15'))).toBe('August 15, 2026');
        expect(formatEventDay(parse('2026-01-05'))).toBe('January 5, 2026');
        expect(formatEventDay(parse('2026-12-31'))).toBe('December 31, 2026');
    });

    it('writes the time on a 12-hour clock', () => {
        expect(formatEventTime(parse('2026-08-15T08:00'))).toBe('8:00 AM');
        expect(formatEventTime(parse('2026-08-15T13:05'))).toBe('1:05 PM');
        expect(formatEventTime(parse('2026-08-15T23:59'))).toBe('11:59 PM');
    });

    it('writes midnight as 12 AM and noon as 12 PM', () => {
        expect(formatEventTime(parse('2026-08-15T00:00'))).toBe('12:00 AM');
        expect(formatEventTime(parse('2026-08-15T00:05'))).toBe('12:05 AM');
        expect(formatEventTime(parse('2026-08-15T12:00'))).toBe('12:00 PM');
        expect(formatEventTime(parse('2026-08-15T12:30'))).toBe('12:30 PM');
    });

    it('writes no time for a date-only value', () => {
        expect(formatEventTime(parse('2026-08-15'))).toBe('');
    });
});

describe('event date: ordering', () => {
    it('puts an end before its start when it is earlier on the same day', () => {
        expect(eventDateKey(parse('2026-08-15T08:00'))).toBeLessThan(eventDateKey(parse('2026-08-15T10:00')));
        expect(eventDateKey(parse('2026-08-15T10:00'))).toBeGreaterThan(eventDateKey(parse('2026-08-15T08:00')));
    });

    it('orders by day before time of day', () => {
        expect(eventDateKey(parse('2026-08-16T00:00'))).toBeGreaterThan(eventDateKey(parse('2026-08-15T23:59')));
        expect(eventDateKey(parse('2026-12-31'))).toBeLessThan(eventDateKey(parse('2027-01-01')));
    });

    it('treats a date-only value as the start of that day', () => {
        expect(eventDateKey(parse('2026-08-15'))).toBe(eventDateKey(parse('2026-08-15T00:00')));
        expect(eventDateKey(parse('2026-08-15'))).toBeLessThan(eventDateKey(parse('2026-08-15T00:01')));
    });
});

describe('event date: shown in the Event block', () => {
    const when = (props: { start: string; end?: string }) => {
        const html = renderBlocks([createBlock('event', props)]);
        const match = /<dd class="mt-0.5 text-foreground">(.*?)<\/dd>/.exec(html);
        return match ? match[1] : null;
    };

    it('shows a start with a time', () => {
        expect(when({ start: '2026-08-15T13:05' })).toBe(
            '<time datetime="2026-08-15T13:05">August 15, 2026, 1:05 PM</time>',
        );
    });

    it('shows a multi-day range with times on both ends', () => {
        expect(when({ start: '2026-08-15T08:00', end: '2026-08-17T17:30' })).toBe(
            '<time datetime="2026-08-15T08:00">August 15, 2026, 8:00 AM</time> – <time datetime="2026-08-17T17:30">August 17, 2026, 5:30 PM</time>',
        );
    });

    it('shows a same-day range of date-only values as a single day', () => {
        expect(when({ start: '2026-08-15', end: '2026-08-15' })).toBe(
            '<time datetime="2026-08-15">August 15, 2026</time>',
        );
    });

    it('shows the end day with its time when only the end has a time on the same day', () => {
        expect(when({ start: '2026-08-15', end: '2026-08-15T10:00' })).toBe(
            '<time datetime="2026-08-15">August 15, 2026</time> – <time datetime="2026-08-15T10:00">August 15, 2026, 10:00 AM</time>',
        );
    });

    it('ignores an end before the start and shows the start alone', () => {
        expect(when({ start: '2026-08-15T10:00', end: '2026-08-15T08:00' })).toBe(
            '<time datetime="2026-08-15T10:00">August 15, 2026, 10:00 AM</time>',
        );
    });

    it('ignores an invalid end and shows the start alone', () => {
        expect(when({ start: '2026-08-15', end: 'soon' })).toBe('<time datetime="2026-08-15">August 15, 2026</time>');
    });

    it('shows no date for an invalid or empty start', () => {
        expect(when({ start: 'soon' })).toBeNull();
        expect(when({ start: '' })).toBeNull();
    });
});
