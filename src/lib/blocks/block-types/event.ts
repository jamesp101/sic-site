import { z } from 'zod';
import type { BlockTypeModule } from '../block-type';
import { eventDateKey, formatEventDay, formatEventTime, parseEventDate, type EventDate } from '../event-date';
import { esc, paragraphsHtml } from '../render-kit';
import { body, label, str } from '../schema-kit';
import { richOf, textOf } from '../text-kit';

function dateRange(start: EventDate, end: EventDate | null): string {
    const time = (date: EventDate, text: string) => `<time datetime="${esc(date.iso)}">${esc(text)}</time>`;
    const day = formatEventDay(start);
    const startTime = formatEventTime(start);
    if (!end) return time(start, startTime ? `${day}, ${startTime}` : day);
    const sameDay = formatEventDay(end) === day;
    const endTime = formatEventTime(end);
    if (sameDay && startTime && endTime) {
        return `${time(start, `${day}, ${startTime}`)} – ${time(end, endTime)}`;
    }
    if (sameDay && !startTime) return time(start, day);
    return `${time(start, startTime ? `${day}, ${startTime}` : day)} – ${time(end, `${formatEventDay(end)}${endTime ? `, ${endTime}` : ''}`)}`;
}

export const event: BlockTypeModule<'event'> = {
    meta: { label: 'Event details', group: 'Content', description: 'Date, time and location.' },
    defaults: () => ({ title: '', start: '', end: '', location: '', note: '' }),
    schema: z.object({ title: label, start: str(16), end: str(16), location: label, note: body }),
    rules(props, report) {
        const start = parseEventDate(props.start);
        if (!start) report('Choose a valid start date.', ['start']);
        if (props.end) {
            const end = parseEventDate(props.end);
            if (!end) report('Choose a valid end date.', ['end']);
            else if (start && eventDateKey(end) < eventDateKey(start))
                report('The end must be after the start.', ['end']);
        }
    },
    html(block, ctx) {
        const p = block.props;
        const start = parseEventDate(p.start);
        const end = parseEventDate(p.end);
        if (!start && !p.location.trim() && !p.title.trim()) return '';
        const when = start
            ? `<div><dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">When</dt><dd class="mt-0.5 text-foreground">${dateRange(start, end && eventDateKey(end) >= eventDateKey(start) ? end : null)}</dd></div>`
            : '';
        const where = p.location.trim()
            ? `<div><dt class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where</dt><dd class="mt-0.5 text-foreground">${esc(p.location)}</dd></div>`
            : '';
        const title = p.title.trim() ? `<p class="mb-3 text-lg font-bold text-primary">${esc(p.title)}</p>` : '';
        return `<div class="rounded-2xl border border-border bg-surface p-5 shadow-brand-sm"${ctx.hooks(block)}>${title}<dl class="grid gap-4 text-sm sm:grid-cols-2">${when}${where}</dl>${paragraphsHtml(p.note, 'mt-3 text-sm leading-relaxed text-muted-foreground')}</div>`;
    },
    text(props) {
        const start = parseEventDate(props.start);
        return [
            textOf(props.title),
            start ? `${formatEventDay(start)} ${formatEventTime(start)}` : '',
            textOf(props.location),
            richOf(props.note),
        ];
    },
};
