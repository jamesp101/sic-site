/** Tolerant readers for plain-text extraction: stored props may have any shape. */
import { inlineToText } from './inline';
import type { Json } from './block-type';

export const isObject = (value: unknown): value is Json =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
export const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');
export const itemsOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
/** Text with inline markup (`**bold**`, links) reduced to its words. */
export const richOf = (value: unknown): string => inlineToText(textOf(value));
