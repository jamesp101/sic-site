import { describe, expect, it } from 'vite-plus/test';
import { toPlainText } from '../markdown';
import { createBlock, createDocument, serializeDocument } from './document';
import { blocksToPlainText } from './plain-text';
import type { Block } from './types';

const text = (...blocks: Block[]) => toPlainText(serializeDocument(createDocument(blocks)));

describe('toPlainText: block documents', () => {
    it('extracts headings, paragraphs (without inline markup) and quotes', () => {
        expect(text(createBlock('heading', { text: 'Welcome' }))).toBe('Welcome');
        expect(
            text(createBlock('paragraph', { text: 'Hello **world**, *dear* [friend](https://x.example)\nbye' })),
        ).toBe('Hello world, dear friend bye');
        expect(text(createBlock('paragraph', { text: 'a \\*b\\*' }))).toBe('a *b*');
        expect(text(createBlock('quote', { text: 'A *quote*', cite: 'Ana' }))).toBe('A quote');
    });

    it('extracts list items, badges and stats', () => {
        expect(text(createBlock('list', { items: ['One', '**Two**'] }))).toBe('One Two');
        expect(text(createBlock('badges', { items: ['A', 'B'] }))).toBe('A, B');
        expect(text(createBlock('stats', { items: [{ value: '25', label: 'Years', hint: 'ignored' }] }))).toBe(
            '25 Years',
        );
    });

    it('extracts cards, tables, accordions and callouts', () => {
        expect(text(createBlock('card', { title: 'Card', body: 'Body **text**' }))).toBe('Card Body text');
        expect(
            text(
                createBlock('table', {
                    rows: [
                        ['A', '**B**'],
                        ['1', '2'],
                    ],
                }),
            ),
        ).toBe('A B 1 2');
        expect(text(createBlock('accordion', { items: [{ title: 'Question', body: 'Answer' }] }))).toBe(
            'Question Answer',
        );
        expect(text(createBlock('callout', { title: 'Heads up', text: 'Be careful' }))).toBe('Heads up Be careful');
    });

    it('extracts events with a readable date', () => {
        expect(
            text(createBlock('event', { title: 'Fest', start: '2026-08-15T08:00', location: 'Gym', note: 'Bring ID' })),
        ).toBe('Fest August 15, 2026 8:00 AM Gym Bring ID');
        expect(text(createBlock('event', { title: 'Fest', start: '2026-08-15' }))).toBe('Fest August 15, 2026');
        expect(text(createBlock('event', { title: 'Fest', start: 'nonsense' }))).toBe('Fest');
    });

    it('strips Markdown blocks', () => {
        expect(text(createBlock('markdown', { source: '# Title\n\n- a **b**\n\n[link](https://x.example)' }))).toBe(
            'Title a b link',
        );
    });

    it('walks nested blocks in order and ignores blocks without text', () => {
        const row = createBlock('row');
        row.children = [createBlock('paragraph', { text: 'inner' }), createBlock('spacer'), createBlock('divider')];
        const section = createBlock('section');
        section.children = [createBlock('heading', { text: 'First' }), row];
        expect(
            text(
                section,
                createBlock('image', { src: '/a.png', alt: 'Alt text' }),
                createBlock('paragraph', { text: 'last' }),
            ),
        ).toBe('First inner last');
    });

    it('returns clean text without JSON or braces', () => {
        const row = createBlock('row');
        row.children = [
            createBlock('heading', { text: 'Heading' }),
            createBlock('paragraph', { text: 'Paragraph' }),
            createBlock('list', { items: ['Item'] }),
            createBlock('card', { title: 'Card', body: 'Body' }),
            createBlock('table'),
            createBlock('accordion'),
            createBlock('callout'),
            createBlock('event', { title: 'Event', start: '2026-08-15' }),
            createBlock('markdown', { source: '## Legacy' }),
        ];
        const result = text(row);
        expect(result).not.toMatch(/[{}[\]"]/);
        for (const word of ['sic-blocks', 'version', 'props', 'type', 'children', 'blocks', 'id']) {
            expect(result).not.toContain(word);
        }
        expect(result).toContain('Heading Paragraph Item Card Body');
        expect(result).toContain('Legacy');
    });

    it('normalises whitespace', () => {
        expect(text(createBlock('paragraph', { text: '  spaced \n\n  out  ' }))).toBe('spaced out');
        expect(text(createBlock('heading', { text: '' }))).toBe('');
    });

    it('returns an empty string for empty documents', () => {
        expect(text()).toBe('');
        expect(toPlainText('{"type":"sic-blocks","version":1,"blocks":"nope"}')).toBe('');
    });

    it('tolerates malformed blocks', () => {
        const json =
            '{"type":"sic-blocks","version":1,"blocks":[null,5,"x",{"type":"paragraph"},{"type":"paragraph","props":{"text":5}},{"type":"heading","props":null,"children":"x"}]}';
        expect(toPlainText(json)).toBe('');
    });

    it('returns an empty string for malformed block JSON instead of leaking markup', () => {
        expect(blocksToPlainText('{"type":"sic-blocks","version":1,"blocks":[')).toBe('');
        expect(toPlainText('{"type":"sic-blocks"')).toBe('');
        expect(toPlainText('{"type":"sic-blocks","version":1,"blocks":[{"type":"paragraph"')).toBe('');
    });
});

describe('toPlainText: legacy Markdown', () => {
    it('keeps its behaviour for Markdown input', () => {
        expect(toPlainText(null)).toBe('');
        expect(toPlainText(undefined)).toBe('');
        expect(toPlainText('')).toBe('');
        expect(toPlainText('# Title\n\nSome **bold** and [link](https://x.example).')).toBe(
            'Title Some bold and link.',
        );
        expect(toPlainText('- one\n- two\n\n1. three')).toBe('one two three');
        expect(toPlainText("import Foo from './foo';\n\nText")).toBe('Text');
        expect(toPlainText('<Card title="T">\nBody\n</Card>')).toBe('Body');
        expect(toPlainText('<Badges tags="a, b" />')).toBe('a, b');
    });

    it('does not treat Markdown that merely mentions the marker as a document', () => {
        expect(toPlainText('Notes about sic-blocks documents')).toBe('Notes about sic-blocks documents');
        expect(toPlainText('{"hello":"world"}')).toBe('{"hello":"world"}');
    });
});
