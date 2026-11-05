import { describe, expect, it } from 'vite-plus/test';
import { createBlock, createDocument, defaultProps, serializeDocument } from './document';
import { blocksToPlainText } from './plain-text';
import { BLOCK_REGISTRY, BLOCK_TYPES, blockModule } from './registry';
import { renderBlocks } from './render';
import { blockFieldErrors, validateDocument } from './schema';
import type { Block, BlockType, PropsByType } from './types';

/**
 * One fixture per Block type, completeness enforced by the compiler: `props` is a valid example (`'defaults'`
 * when the defaults already validate) and `text` the words plain-text extraction must produce for it.
 */
const FIXTURES: { [T in BlockType]: { props: PropsByType[T] | 'defaults'; text: string[] } } = {
    section: { props: 'defaults', text: [] },
    row: { props: 'defaults', text: [] },
    grid: { props: 'defaults', text: [] },
    columns: { props: 'defaults', text: [] },
    spacer: { props: 'defaults', text: [] },
    divider: { props: 'defaults', text: [] },
    heading: { props: { text: 'Welcome heading', level: 2, align: 'inherit' }, text: ['Welcome heading'] },
    paragraph: {
        props: { text: 'Some **bold** words', size: 'base', tone: 'default', align: 'inherit' },
        text: ['Some bold words'],
    },
    list: { props: { ordered: false, items: ['One', 'Two'] }, text: ['One Two'] },
    quote: { props: { text: 'Quoted line', cite: 'Someone' }, text: ['Quoted line'] },
    button: { props: { label: 'Apply', href: '/apply', variant: 'primary', align: 'left' }, text: [] },
    badges: { props: { items: ['Red', 'Blue'] }, text: ['Red, Blue'] },
    card: {
        props: { title: 'Card title', body: 'Card body', imageUrl: '', imageAlt: '', linkLabel: '', linkHref: '' },
        text: ['Card title Card body'],
    },
    image: {
        props: {
            src: '/storage/a.webp',
            alt: 'A photo',
            decorative: false,
            caption: 'Cap',
            width: null,
            height: null,
            link: '',
        },
        text: [],
    },
    album: {
        props: { images: [{ src: '/storage/a.webp', alt: 'Alt one', caption: 'Cap one' }], columns: 3 },
        text: ['Alt one Cap one'],
    },
    table: {
        props: {
            header: true,
            caption: 'Caption',
            rows: [
                ['A1', 'B1'],
                ['A2', 'B2'],
            ],
        },
        text: ['A1 B1 A2 B2'],
    },
    accordion: { props: { items: [{ title: 'Q one', body: 'A one' }] }, text: ['Q one A one'] },
    callout: { props: { tone: 'info', title: 'Notice', text: 'Details' }, text: ['Notice Details'] },
    stats: { props: { items: [{ value: '100+', label: 'Students', hint: 'since 1950' }] }, text: ['100+ Students'] },
    video: { props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'A video', caption: '' }, text: [] },
    event: {
        props: { title: 'Open day', start: '2026-03-05T09:00', end: '', location: 'Main hall', note: 'Bring ID' },
        text: ['Open day', 'Main hall', 'Bring ID'],
    },
    markdown: { props: { source: '**Bold** md text' }, text: ['Bold md text'] },
};

const HOSTILE = '<script>alert(1)</script><img src=x onerror=alert(1)>"\'&';

function block(type: BlockType, props: unknown): Block {
    return { ...createBlock(type), props } as Block;
}

function sample(type: BlockType): Block {
    const { props } = FIXTURES[type];
    return block(type, props === 'defaults' ? defaultProps(type) : props);
}

/** Paths of every string inside `value`. */
function stringPaths(value: unknown, path: (string | number)[] = []): (string | number)[][] {
    if (typeof value === 'string') return [path];
    if (typeof value !== 'object' || value === null) return [];
    return Object.entries(value).flatMap(([key, child]) =>
        stringPaths(child, [...path, Array.isArray(value) ? Number(key) : key]),
    );
}

function withValueAt(value: unknown, path: (string | number)[], next: string): unknown {
    if (path.length === 0) return next;
    const copy: Record<string | number, unknown> = Array.isArray(value)
        ? Object.fromEntries(value.entries())
        : { ...(value as object) };
    copy[path[0]] = withValueAt(copy[path[0]], path.slice(1), next);
    if (Array.isArray(value)) return value.map((_, i) => copy[i]);
    return copy;
}

/** The block's example props with every string replaced by hostile markup wherever that still validates. */
function hostile(type: BlockType): { block: Block; replaced: number } {
    let current: unknown = sample(type).props;
    let replaced = 0;
    for (const path of stringPaths(current)) {
        const candidate = withValueAt(current, path, HOSTILE);
        if (validateDocument(createDocument([block(type, candidate)])).ok) {
            current = candidate;
            replaced++;
        }
    }
    return { block: block(type, current), replaced };
}

describe.each(BLOCK_TYPES)('Block type %s', (type) => {
    it('has defaults that fit its schema unchanged', () => {
        const kind = blockModule(type);
        const result = kind.schema.safeParse(kind.defaults());
        expect(result.success).toBe(true);
        expect(result.data).toEqual(kind.defaults());
    });

    it('validates its example props and keeps them as stored', () => {
        const result = validateDocument(createDocument([sample(type)]));
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.document.blocks[0].props).toEqual(sample(type).props);
        expect(blockFieldErrors(type, sample(type).props as never)).toEqual({});
    });

    it('is a container exactly when it declares children', () => {
        expect('container' in BLOCK_REGISTRY[type]).toBe(createBlock(type).children !== undefined);
    });

    it('renders its example in the editor, and publicly unless it is an empty container', () => {
        const example = sample(type);
        const editor = renderBlocks([example], { editor: true });
        expect(editor).toContain(`data-block-type="${type}"`);
        if (!('container' in BLOCK_REGISTRY[type])) expect(renderBlocks([example])).not.toBe('');
    });

    it('escapes hostile strings in both renderings', () => {
        const { block: hostileBlock, replaced } = hostile(type);
        for (const editor of [false, true]) {
            const html = renderBlocks([hostileBlock], { editor });
            expect(html).not.toContain('<script');
            expect(html).not.toContain('<img src=x');
            expect(html).not.toContain('"<');
            if (replaced > 0 && html) expect(html).toContain('&lt;script&gt;');
        }
    });

    it('extracts its plain text from the stored JSON', () => {
        const text = blocksToPlainText(serializeDocument(createDocument([sample(type)])));
        const { text: expected } = FIXTURES[type];
        if (expected.length === 0) expect(text).toBe('');
        for (const part of expected) expect(text).toContain(part);
    });
});

describe('registry', () => {
    it('lists every Block type once, in palette order', () => {
        expect(new Set(BLOCK_TYPES).size).toBe(BLOCK_TYPES.length);
        expect(Object.keys(FIXTURES)).toEqual(BLOCK_TYPES);
    });

    it('ignores a type it does not know in stored content', () => {
        const json = JSON.stringify({ type: 'sic-blocks', version: 1, blocks: [{ id: 'a', type: 'nope', props: {} }] });
        expect(blocksToPlainText(json)).toBe('');
    });
});

describe('blockFieldErrors', () => {
    it('reports the schema rules per prop', () => {
        expect(blockFieldErrors('image', { ...defaultProps('image'), src: '/storage/a.webp' })).toEqual({
            alt: 'Describe the image in the alt text, or mark it as decorative.',
        });
        expect(blockFieldErrors('button', { ...defaultProps('button'), href: 'javascript:alert(1)' })).toEqual({
            href: 'Enter a valid link (https://, /path, mailto: or tel:).',
        });
    });

    it('reports shape errors on the offending prop', () => {
        const errors = blockFieldErrors('heading', { ...defaultProps('heading'), text: 'x'.repeat(301) });
        expect(Object.keys(errors)).toEqual(['text']);
    });
});
