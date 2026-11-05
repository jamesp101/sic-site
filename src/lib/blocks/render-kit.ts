/** HTML helpers and class tables shared by the Block type modules. Tailwind finds the class names by scanning. */
import { escapeHtml } from '../markdown';
import { inlineToHtml, paragraphsOf } from './inline';

export const esc = escapeHtml;

export const GAP = { none: 'gap-0', sm: 'gap-2', md: 'gap-4', lg: 'gap-8' } as const;
export const TEXT_ALIGN = { inherit: '', left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/** Lookup that never returns inherited/undefined entries for odd stored values. */
export function pick<T extends Record<string, string>>(table: T, key: unknown, fallback: keyof T): string {
    return typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : table[fallback];
}

export function joinClasses(...parts: (string | false | null | undefined)[]): string {
    return parts.filter(Boolean).join(' ');
}

export function paragraphsHtml(text: string, className: string): string {
    return paragraphsOf(text)
        .map((part) => `<p class="${className}">${inlineToHtml(part)}</p>`)
        .join('');
}

export function flow(inner: string, gap = 'gap-4'): string {
    return `<div class="flex flex-col ${gap}">${inner}</div>`;
}
