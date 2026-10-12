import { describe, expect, it } from 'vite-plus/test';
import { createBlock, createDocument, serializeDocument } from './document';
import { checkContent, parseBlockDocument, validateDocument, type ValidationResult } from './schema';
import { LIMITS, type Block } from './types';

const raw = (blocks: unknown[]) => ({ type: 'sic-blocks', version: 1, blocks });
const leaf = (type: string, props: Record<string, unknown> = {}, id = 'a1') => ({ id, type, props });
const messages = (result: ValidationResult) => (result.ok ? [] : result.issues.map((issue) => issue.message));
const rejects = (result: ValidationResult, text: string) => {
    expect(result.ok).toBe(false);
    expect(messages(result).some((message) => message.includes(text))).toBe(true);
};

/** Nested raw rows, `depth` levels. */
function nestedRows(depth: number, level = 1): unknown {
    return {
        id: `r${level}`,
        type: 'row',
        props: {},
        children: level < depth ? [nestedRows(depth, level + 1)] : [],
    };
}

describe('validateDocument: structure', () => {
    it('round trips a valid document with every block type unchanged', () => {
        const row = createBlock('row');
        row.children = [
            createBlock('heading', { text: 'Title', level: 3 }),
            createBlock('paragraph', { text: 'Hello **world**' }),
            createBlock('list'),
            createBlock('quote', { text: 'Quote', cite: 'Someone' }),
            createBlock('button'),
            createBlock('badges'),
            createBlock('card', { title: 'Card', linkLabel: 'Go', linkHref: '/go' }),
            createBlock('image', { src: 'https://example.com/a.png', alt: 'An image', width: 640, height: 480 }),
            createBlock('table'),
            createBlock('accordion'),
            createBlock('callout', { tone: 'warning' }),
            createBlock('stats'),
            createBlock('video', { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Tour' }),
            createBlock('event', { title: 'Fest', start: '2026-08-15T08:00', end: '2026-08-15T10:00' }),
            createBlock('markdown', { source: '# Legacy' }),
            createBlock('spacer'),
            createBlock('divider'),
        ];
        const section = createBlock('section');
        section.children = [row];
        const blocks: Block[] = [section, createBlock('grid'), createBlock('columns'), createBlock('paragraph')];
        const input = createDocument(blocks);

        const result = validateDocument(input);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.document).toEqual(input);

        const parsed = parseBlockDocument(serializeDocument(input));
        expect(parsed.ok).toBe(true);
        if (parsed.ok) expect(parsed.document).toEqual(input);
    });

    it('accepts an empty document', () => {
        expect(validateDocument(raw([]))).toEqual({ ok: true, document: raw([]) });
    });

    it('rejects values that are not block documents', () => {
        for (const input of [
            null,
            'text',
            42,
            {},
            { type: 'sic-blocks' },
            { ...raw([]), version: 2 },
            { ...raw([]), type: 'x' },
        ]) {
            expect(validateDocument(input).ok).toBe(false);
        }
        expect(validateDocument({ ...raw([]), blocks: 'nope' }).ok).toBe(false);
    });

    it('rejects unknown block types', () => {
        const result = validateDocument(raw([leaf('script', { src: 'x' })]));
        expect(result.ok).toBe(false);
        rejects(result, 'Unknown block type');
    });

    it('drops unknown props and fills defaults', () => {
        const result = validateDocument(raw([leaf('paragraph', { text: 'Hi', onclick: 'alert(1)', style: 'x' })]));
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.document.blocks[0].props).toEqual({
                text: 'Hi',
                size: 'base',
                tone: 'default',
                align: 'inherit',
            });
        }
    });

    it('treats missing props as defaults', () => {
        const result = validateDocument(raw([{ id: 'a1', type: 'paragraph' }]));
        expect(result.ok).toBe(true);
    });

    it('rejects invalid prop values (enums, types)', () => {
        expect(validateDocument(raw([leaf('spacer', { size: 'huge' })])).ok).toBe(false);
        expect(validateDocument(raw([leaf('paragraph', { text: 5 })])).ok).toBe(false);
        expect(validateDocument(raw([leaf('grid', { columns: 9 })])).ok).toBe(false);
        expect(validateDocument(raw([leaf('columns', { count: 4 })])).ok).toBe(false);
    });

    it('rejects bad and duplicate ids', () => {
        expect(validateDocument(raw([leaf('divider', {}, 'a b')])).ok).toBe(false);
        expect(validateDocument(raw([leaf('divider', {}, '')])).ok).toBe(false);
        expect(validateDocument(raw([leaf('divider', {}, 'x'.repeat(33))])).ok).toBe(false);
        rejects(
            validateDocument(raw([leaf('divider', {}, 'same'), leaf('spacer', {}, 'same')])),
            'Duplicate element id',
        );
    });

    it('rejects children on non-container blocks', () => {
        const result = validateDocument(raw([{ id: 'a1', type: 'paragraph', props: {}, children: [] }]));
        rejects(result, 'cannot contain');
    });

    it('rejects sections that are not at the top level', () => {
        const inSection = raw([
            { id: 's1', type: 'section', props: {}, children: [{ id: 's2', type: 'section', props: {} }] },
        ]);
        rejects(validateDocument(inSection), 'Sections can only be placed at the top level');
        const inRow = raw([{ id: 'r1', type: 'row', props: {}, children: [{ id: 's2', type: 'section', props: {} }] }]);
        rejects(validateDocument(inRow), 'Sections can only be placed at the top level');
        expect(validateDocument(raw([{ id: 's1', type: 'section', props: {}, children: [] }])).ok).toBe(true);
    });

    it('attaches the block id to issues', () => {
        const result = validateDocument(raw([leaf('image', { src: '/a.png' }, 'img1')]));
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.issues.some((issue) => issue.blockId === 'img1')).toBe(true);
    });
});

describe('validateDocument: block rules', () => {
    it('requires alt text on images unless they are decorative', () => {
        const missing = validateDocument(raw([leaf('image', { src: 'https://example.com/a.png', alt: '' })]));
        rejects(missing, 'alt');
        rejects(validateDocument(raw([leaf('image', { src: '/a.png', alt: '   ' })])), 'alt');

        expect(validateDocument(raw([leaf('image', { src: '/storage/a.png', alt: 'A tree' })])).ok).toBe(true);
        expect(validateDocument(raw([leaf('image', { src: '/storage/a.png', decorative: true })])).ok).toBe(true);
    });

    it('requires an allowed image source', () => {
        rejects(validateDocument(raw([leaf('image', { src: '', alt: 'x' })])), 'Choose an image');
        for (const src of [
            'javascript:alert(1)',
            'data:image/png;base64,AAAA',
            '//evil.com/a.png',
            'ftp://example.com/a.png',
        ]) {
            rejects(validateDocument(raw([leaf('image', { src, alt: 'x' })])), 'not allowed');
        }
        expect(validateDocument(raw([leaf('image', { src: 'x', alt: 'x', width: 0 })])).ok).toBe(false);
    });

    it('rejects unsafe button links', () => {
        for (const href of [
            'javascript:alert(1)',
            'data:text/html,<b>x</b>',
            ' java\tscript:alert(1)',
            'JAVASCRIPT:alert(1)',
            '//evil.com',
            '',
        ]) {
            const result = validateDocument(raw([leaf('button', { label: 'Go', href })]));
            expect(result.ok, JSON.stringify(href)).toBe(false);
        }
        for (const href of [
            '/admissions',
            'https://example.com/x',
            'mailto:info@example.com',
            'tel:+639171234567',
            '#top',
            'page?x=1',
        ]) {
            const result = validateDocument(raw([leaf('button', { label: 'Go', href })]));
            expect(result.ok, href).toBe(true);
        }
        rejects(validateDocument(raw([leaf('button', { label: ' ', href: '/' })])), 'label');
    });

    it('rejects unsafe card links and images', () => {
        for (const linkHref of ['javascript:alert(1)', 'data:text/html;base64,AAAA', ' java\tscript:alert(1)']) {
            const result = validateDocument(raw([leaf('card', { title: 'T', linkLabel: 'Go', linkHref })]));
            expect(result.ok, JSON.stringify(linkHref)).toBe(false);
        }
        rejects(validateDocument(raw([leaf('card', { title: 'T', imageUrl: 'javascript:alert(1)' })])), 'not allowed');
        rejects(validateDocument(raw([leaf('card', { title: 'T', linkHref: '/x' })])), 'label');
        expect(validateDocument(raw([leaf('card', { title: 'T', linkLabel: 'Go', linkHref: '/x' })])).ok).toBe(true);
        expect(validateDocument(raw([leaf('card', { title: 'T' })])).ok).toBe(true);
    });

    it('only accepts YouTube and Vimeo videos', () => {
        for (const url of [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://youtu.be/dQw4w9WgXcQ',
            'https://vimeo.com/123456789',
        ]) {
            expect(validateDocument(raw([leaf('video', { url, title: 'Tour' })])).ok, url).toBe(true);
        }
        for (const url of [
            'https://evil.com/watch?v=dQw4w9WgXcQ',
            'https://youtube.com.evil.com/watch?v=aaaaaaaaaaa',
            'javascript:alert(1)',
            '',
        ]) {
            rejects(validateDocument(raw([leaf('video', { url, title: 'Tour' })])), 'YouTube or Vimeo');
        }
        rejects(validateDocument(raw([leaf('video', { url: 'https://youtu.be/dQw4w9WgXcQ', title: '' })])), 'title');
    });

    it('only allows heading levels 2 to 4', () => {
        for (const level of [2, 3, 4])
            expect(validateDocument(raw([leaf('heading', { text: 'T', level })])).ok).toBe(true);
        for (const level of [1, 5, 6, 0, '2', null]) {
            expect(validateDocument(raw([leaf('heading', { text: 'T', level })])).ok, String(level)).toBe(false);
        }
        expect(validateDocument(raw([leaf('heading', { text: 'T' })])).ok).toBe(true);
    });

    it('requires rectangular, non-empty tables', () => {
        rejects(validateDocument(raw([leaf('table', { rows: [['a', 'b'], ['c']] })])), 'same number of columns');
        rejects(validateDocument(raw([leaf('table', { rows: [] })])), 'at least one row');
        expect(
            validateDocument(
                raw([
                    leaf('table', {
                        rows: [
                            ['a', 'b'],
                            ['c', 'd'],
                        ],
                    }),
                ]),
            ).ok,
        ).toBe(true);
        expect(validateDocument(raw([leaf('table', { rows: [[]] })])).ok).toBe(false);
        const wide = [Array.from({ length: LIMITS.tableColumns + 1 }, () => 'x')];
        expect(validateDocument(raw([leaf('table', { rows: wide })])).ok).toBe(false);
    });

    it('requires accordion items with titles', () => {
        rejects(validateDocument(raw([leaf('accordion', { items: [] })])), 'at least one item');
        rejects(validateDocument(raw([leaf('accordion', { items: [{ title: ' ', body: 'x' }] })])), 'title');
        expect(validateDocument(raw([leaf('accordion', { items: [{ title: 'Q', body: 'A' }] })])).ok).toBe(true);
    });

    it('validates event dates', () => {
        const ok = (props: Record<string, unknown>) => validateDocument(raw([leaf('event', props)])).ok;
        expect(ok({ start: '2026-08-15' })).toBe(true);
        expect(ok({ start: '2026-08-15T08:00' })).toBe(true);
        expect(ok({ start: '2026-08-15T08:00', end: '2026-08-15T10:00' })).toBe(true);
        expect(ok({ start: '2026-08-15', end: '2026-08-15' })).toBe(true);
        expect(ok({ start: '2028-02-29' })).toBe(true);

        expect(ok({})).toBe(false);
        expect(ok({ start: '' })).toBe(false);
        expect(ok({ start: '2026-02-30' })).toBe(false);
        expect(ok({ start: '2027-02-29' })).toBe(false);
        expect(ok({ start: '15-08-2026' })).toBe(false);
        expect(ok({ start: '2026-08-15T25:00' })).toBe(false);
        expect(ok({ start: '2026-08-15T08:60' })).toBe(false);
        expect(ok({ start: '2026-08-15', end: 'soon' })).toBe(false);
        rejects(
            validateDocument(raw([leaf('event', { start: '2026-08-15T10:00', end: '2026-08-15T08:00' })])),
            'end must be after',
        );
    });
});

describe('validateDocument: limits', () => {
    const paragraphs = (count: number) =>
        Array.from({ length: count }, (_, index) => leaf('paragraph', { text: 'x' }, `p${index}`));

    it('accepts up to LIMITS.blocks blocks and rejects more', () => {
        expect(validateDocument(raw(paragraphs(LIMITS.blocks))).ok).toBe(true);
        rejects(validateDocument(raw(paragraphs(LIMITS.blocks + 1))), `at most ${LIMITS.blocks} elements`);
    });

    it('counts nested blocks towards the block limit', () => {
        const row = { id: 'r', type: 'row', props: {}, children: paragraphs(LIMITS.blocks) };
        rejects(validateDocument(raw([row])), `at most ${LIMITS.blocks} elements`);
    });

    it('enforces the nesting depth', () => {
        expect(validateDocument(raw([nestedRows(LIMITS.depth)])).ok).toBe(true);
        rejects(validateDocument(raw([nestedRows(LIMITS.depth + 1)])), `nested at most ${LIMITS.depth} levels`);
    });

    it('enforces text, list and label limits', () => {
        expect(validateDocument(raw([leaf('paragraph', { text: 'x'.repeat(LIMITS.text) })])).ok).toBe(true);
        expect(validateDocument(raw([leaf('paragraph', { text: 'x'.repeat(LIMITS.text + 1) })])).ok).toBe(false);
        expect(validateDocument(raw([leaf('heading', { text: 'x'.repeat(LIMITS.label + 1) })])).ok).toBe(false);
        expect(
            validateDocument(raw([leaf('list', { items: Array.from({ length: LIMITS.listItems + 1 }, () => 'x') })]))
                .ok,
        ).toBe(false);
        expect(
            validateDocument(raw([leaf('badges', { items: Array.from({ length: LIMITS.badgeItems + 1 }, () => 'x') })]))
                .ok,
        ).toBe(false);
        expect(validateDocument(raw([leaf('markdown', { source: 'x'.repeat(LIMITS.markdown + 1) })])).ok).toBe(false);
    });

    it('rejects oversized and unparsable stored documents', () => {
        rejects(parseBlockDocument('x'.repeat(LIMITS.documentChars + 1)), 'too large');
        rejects(parseBlockDocument('{not json'), 'not valid JSON');
        rejects(parseBlockDocument('{"type":"sic-blocks","version":1,"blocks":"x"}'), 'not a valid block document');
    });
});

describe('checkContent', () => {
    it('passes legacy Markdown through untouched', () => {
        expect(checkContent('# Title\n\nSome **text**')).toEqual({ ok: true, value: '# Title\n\nSome **text**' });
        expect(checkContent('')).toEqual({ ok: true, value: '' });
        expect(checkContent('{"a":1}')).toEqual({ ok: true, value: '{"a":1}' });
        expect(checkContent('{curly} notes on sic-blocks')).toEqual({ ok: true, value: '{curly} notes on sic-blocks' });
    });

    it('normalises block documents (unknown props removed, defaults added)', () => {
        const input = JSON.stringify(raw([leaf('paragraph', { text: 'Hi', evil: '<script>' })]));
        const result = checkContent(input);
        expect(result.ok).toBe(true);
        if (result.ok) {
            const stored = JSON.parse(result.value);
            expect(stored).toEqual(
                raw([leaf('paragraph', { text: 'Hi', size: 'base', tone: 'default', align: 'inherit' })]),
            );
            expect(result.value).not.toContain('evil');
        }
    });

    it('stores an empty block document as an empty string', () => {
        expect(checkContent(serializeDocument(createDocument([])))).toEqual({ ok: true, value: '' });
    });

    it('rejects invalid block documents with an editor-facing message', () => {
        const result = checkContent(
            JSON.stringify(raw([leaf('button', { label: 'Go', href: 'javascript:alert(1)' })])),
        );
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.message).toContain('valid link');

        const unknown = checkContent(JSON.stringify(raw([leaf('nope')])));
        expect(unknown.ok).toBe(false);
    });
});
