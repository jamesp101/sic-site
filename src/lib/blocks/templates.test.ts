import { describe, expect, it } from 'vite-plus/test';
import { createDocument, flatten } from './document';
import { renderDocument } from './render';
import { validateDocument } from './schema';
import { TEMPLATES } from './templates';

describe('starter templates', () => {
    for (const template of TEMPLATES) {
        it(`${template.label} is a valid, renderable document`, () => {
            const result = validateDocument(createDocument(template.create()));
            expect(result.ok).toBe(true);
            if (!result.ok) return;
            const html = renderDocument(result.document);
            expect(html).not.toBe('');
            expect(html).not.toContain('<h1');
        });
    }

    it('creates fresh ids on every call', () => {
        const first = TEMPLATES[0].create();
        const second = TEMPLATES[0].create();
        const ids = [...flatten(first), ...flatten(second)].map(({ block }) => block.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
