import { describe, expect, it } from 'vite-plus/test';
import { EXCERPT_LENGTH, editableBlocks, excerptOf, parseContent, renderContent, toPlainText } from './content';
import { createBlock, createDocument, serializeDocument } from './document';

const validDocument = serializeDocument(
    createDocument([
        createBlock('heading', { text: 'Welcome', level: 2 }),
        createBlock('paragraph', { text: 'Hello' }),
    ]),
);
const truncatedDocument = `${validDocument.slice(0, 60)}`;

describe('Rich content classification', () => {
    const cases: { name: string; content: string | null; format: 'empty' | 'blocks' | 'markdown'; text: string }[] = [
        { name: 'valid document', content: validDocument, format: 'blocks', text: 'Welcome Hello' },
        { name: 'truncated document', content: truncatedDocument, format: 'blocks', text: '' },
        {
            name: 'document with leading whitespace',
            content: `\n  ${validDocument}`,
            format: 'blocks',
            text: 'Welcome Hello',
        },
        { name: 'Markdown', content: '# Title\n\nSome **text**', format: 'markdown', text: 'Title Some text' },
        { name: 'empty string', content: '', format: 'empty', text: '' },
        { name: 'null', content: null, format: 'empty', text: '' },
    ];

    for (const { name, content, format, text } of cases) {
        it(`render and plain text agree for a ${name}`, () => {
            const parsed = parseContent(content);
            expect(parsed.format).toBe(format);
            expect(parsed.text()).toBe(text);
            expect(toPlainText(content)).toBe(text);
            expect(renderContent(content)).toBe(parsed.html());
            // Nothing readable: no text and no HTML, from the same decision.
            expect(parsed.html() === '').toBe(text === '');
            // JSON never leaks into either output.
            if (format === 'blocks') {
                expect(parsed.html()).not.toContain('sic-blocks"');
                expect(parsed.text()).not.toContain('{');
            }
        });
    }
});

describe('excerpt', () => {
    it('is the plain text cut to the module limit with an ellipsis', () => {
        const long = 'word '.repeat(100);
        const excerpt = excerptOf(long);
        expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_LENGTH);
        expect(excerpt.endsWith('…')).toBe(true);
        expect(excerptOf('Short text')).toBe('Short text');
    });

    it('is empty for a truncated block document', () => {
        expect(excerptOf(truncatedDocument)).toBe('');
    });
});

describe('check', () => {
    it('passes Markdown and empty values through', () => {
        expect(parseContent('# A').check()).toEqual({ ok: true, value: '# A' });
        expect(parseContent('').check()).toEqual({ ok: true, value: '' });
    });

    it('normalises valid documents and stores empty ones as an empty string', () => {
        const valid = parseContent(validDocument).check();
        expect(valid.ok).toBe(true);
        if (valid.ok) expect(JSON.parse(valid.value)).toMatchObject({ type: 'sic-blocks', version: 1 });
        expect(parseContent(serializeDocument(createDocument([]))).check()).toEqual({ ok: true, value: '' });
    });

    it('rejects a truncated document instead of saving it as Markdown', () => {
        const result = parseContent(truncatedDocument).check();
        expect(result.ok).toBe(false);
    });
});

describe('editableBlocks', () => {
    it('opens a valid document as its blocks', () => {
        const blocks = editableBlocks(validDocument);
        expect(blocks.map((block) => block.type)).toEqual(['heading', 'paragraph']);
    });

    it('opens an invalid but parseable document as-is so nothing is lost', () => {
        const unknown = '{"type":"sic-blocks","version":1,"blocks":[{"id":"a","type":"nope","props":{}}]}';
        expect(editableBlocks(unknown)).toEqual([{ id: 'a', type: 'nope', props: {} }]);
    });

    it('opens unparseable block JSON as one Markdown block with the source', () => {
        const blocks = editableBlocks(truncatedDocument);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ type: 'markdown', props: { source: truncatedDocument } });
    });

    it('opens Markdown as one Markdown block', () => {
        const blocks = editableBlocks('# Title\n\nText');
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({ type: 'markdown', props: { source: '# Title\n\nText' } });
    });

    it('opens empty and blank values as no blocks', () => {
        expect(editableBlocks('')).toEqual([]);
        expect(editableBlocks(null)).toEqual([]);
        expect(editableBlocks('  \n')).toEqual([]);
    });
});
