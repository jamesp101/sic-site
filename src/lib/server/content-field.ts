import { z } from 'astro/zod';
import { checkContent } from '@/lib/blocks/schema';

/**
 * Zod field for a content column that holds either a block document or legacy Markdown. Block
 * documents are validated and stored in normalised form; Markdown passes through unchanged.
 */
export function contentField(options: { required: boolean }) {
    return z.string().transform((value, ctx) => {
        const checked = checkContent(value);
        if (!checked.ok) {
            ctx.addIssue({ code: 'custom', message: checked.message });
            return z.NEVER;
        }
        if (options.required && checked.value.trim() === '') {
            ctx.addIssue({ code: 'custom', message: 'The content is required.' });
            return z.NEVER;
        }
        return checked.value;
    });
}
