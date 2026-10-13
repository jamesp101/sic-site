import { describe, expect, test } from 'vite-plus/test';
import {
    MAX_LAYERS,
    defaultLayer,
    legacyFields,
    legacyLayers,
    readingOrder,
    relFor,
    safeHref,
    safeImageSrc,
    serializeOverlay,
    normalizeSize,
    TYPE_SCALE,
    DEFAULT_SIZE,
    type Layer,
} from './carousel-overlay';
import { parseOverlay, parseOverlayStrict } from './carousel-overlay-schema';

const text = (over: Partial<Layer> = {}): Layer => ({ ...defaultLayer('text'), ...over }) as Layer;

describe('safeHref', () => {
    test('allows paths, fragments and http(s)/mailto/tel', () => {
        for (const url of [
            '/posts',
            '/a?b=1#c',
            '#top',
            'https://sic.edu/x',
            'http://a.test',
            'mailto:a@b.test',
            'tel:+63123',
        ])
            expect(safeHref(url)).toBe(url);
    });

    test('blocks script-capable, protocol-relative and malformed URLs', () => {
        for (const url of [
            'javascript:alert(1)',
            ' JaVaScRiPt:alert(1)',
            'java\tscript:alert(1)',
            'data:text/html,<script>',
            'vbscript:x',
            '//evil.test',
            '/\\evil.test',
            'posts',
            'ftp://a.test',
            '',
            '   ',
            `/${'a'.repeat(600)}`,
        ])
            expect(safeHref(url)).toBeNull();
        expect(safeHref(null)).toBeNull();
    });

    test('image sources are paths or http(s) only', () => {
        expect(safeImageSrc('/storage/posts/inline/a.png')).toBe('/storage/posts/inline/a.png');
        expect(safeImageSrc('https://cdn.test/a.png')).toBe('https://cdn.test/a.png');
        expect(safeImageSrc('mailto:a@b.test')).toBeNull();
        expect(safeImageSrc('#x')).toBeNull();
        expect(safeImageSrc('data:image/png;base64,AAAA')).toBeNull();
    });

    test('external links get a safe rel', () => {
        expect(relFor('https://a.test')).toBe('noopener noreferrer');
        expect(relFor('/posts')).toBeUndefined();
    });
});

describe('parseOverlayStrict', () => {
    test('round-trips every layer type', () => {
        const layers = [
            defaultLayer('shape'),
            defaultLayer('text'),
            defaultLayer('badge'),
            defaultLayer('button'),
            { ...defaultLayer('image'), src: '/storage/posts/inline/logo.png', alt: 'School seal' },
        ];
        const result = parseOverlayStrict(serializeOverlay(layers));
        expect(result).toEqual({ ok: true, layers });
    });

    test('rejects unknown properties, bad enums and out-of-range geometry', () => {
        const wrap = (layer: object) => JSON.stringify({ v: 1, layers: [layer] });
        const base = defaultLayer('text');
        expect(parseOverlayStrict(wrap({ ...base, onclick: 'x' })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, color: '#ff0000' })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, size: '99px' })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, x: 150 })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, w: 0 })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, id: 'a b' })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, text: '' })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ ...base, text: 'x'.repeat(501) })).ok).toBe(false);
        expect(parseOverlayStrict(wrap({ type: 'script', id: 'a' })).ok).toBe(false);
    });

    test('rejects unsafe links, unsafe image sources and missing alt text', () => {
        const wrap = (layer: object) => JSON.stringify({ v: 1, layers: [layer] });
        expect(parseOverlayStrict(wrap({ ...defaultLayer('button'), href: 'javascript:alert(1)' })).ok).toBe(false);
        expect(
            parseOverlayStrict(wrap({ ...defaultLayer('image'), src: 'data:image/png;base64,AA', alt: 'x' })).ok,
        ).toBe(false);
        expect(parseOverlayStrict(wrap({ ...defaultLayer('image'), src: '/storage/a.png', alt: ' ' })).ok).toBe(false);
    });

    test('rejects wrong version, duplicate ids, too many layers and oversize or invalid JSON', () => {
        expect(parseOverlayStrict(JSON.stringify({ v: 2, layers: [] })).ok).toBe(false);
        const a = defaultLayer('text');
        expect(parseOverlayStrict(JSON.stringify({ v: 1, layers: [a, a] })).ok).toBe(false);
        const many = Array.from({ length: MAX_LAYERS + 1 }, () => defaultLayer('text'));
        expect(parseOverlayStrict(serializeOverlay(many)).ok).toBe(false);
        expect(parseOverlayStrict('{not json').ok).toBe(false);
        expect(parseOverlayStrict(`{"v":1,"layers":[],"pad":"${'x'.repeat(41_000)}"}`).ok).toBe(false);
    });

    test('fills defaults and rounds geometry', () => {
        const { type: _t, rotation: _r, opacity: _o, ...rest } = defaultLayer('shape') as Layer & { type: 'shape' };
        const raw = JSON.stringify({ v: 1, layers: [{ type: 'shape', ...rest, x: 1.23456 }] });
        const result = parseOverlayStrict(raw);
        expect(result.ok && result.layers[0]).toMatchObject({ x: 1.23, rotation: 0, opacity: 100 });
    });

    test('keeps HTML as plain text (escaping happens at render time)', () => {
        const raw = serializeOverlay([text({ text: '<img src=x onerror=alert(1)>' } as Partial<Layer>)]);
        const result = parseOverlayStrict(raw);
        expect(result.ok && result.layers[0]).toMatchObject({ text: '<img src=x onerror=alert(1)>' });
    });
});

describe('parseOverlay (tolerant)', () => {
    test('null for missing, invalid or other-version documents', () => {
        expect(parseOverlay(null)).toBeNull();
        expect(parseOverlay('')).toBeNull();
        expect(parseOverlay('nope')).toBeNull();
        expect(parseOverlay('[]')).toBeNull();
        expect(parseOverlay(JSON.stringify({ v: 9, layers: [] }))).toBeNull();
    });

    test('an explicit empty overlay is kept (no legacy fallback)', () => {
        expect(parseOverlay(serializeOverlay([]))).toEqual([]);
    });

    test('drops invalid and duplicate layers; all-invalid falls back to null', () => {
        const good = defaultLayer('text');
        const raw = JSON.stringify({ v: 1, layers: [good, good, { type: 'button', id: 'b', href: 'javascript:1' }] });
        expect(parseOverlay(raw)).toEqual([good]);
        expect(parseOverlay(JSON.stringify({ v: 1, layers: [{ type: 'nope' }] }))).toBeNull();
    });
});

describe('legacy conversion', () => {
    test('builds heading, subtitle and button layers that validate', () => {
        const layers = legacyLayers({ title: 'Welcome', subtitle: 'To SIC', linkUrl: '/posts' });
        expect(layers.map((l) => l.type)).toEqual(['text', 'text', 'button']);
        expect(parseOverlayStrict(serializeOverlay(layers)).ok).toBe(true);
        expect(legacyFields(layers)).toEqual({ title: 'Welcome', subtitle: 'To SIC', linkUrl: '/posts' });
    });

    test('skips empty fields and unsafe links', () => {
        expect(legacyLayers({ title: ' ', subtitle: null, linkUrl: 'javascript:alert(1)' })).toEqual([]);
        expect(legacyFields([])).toEqual({ title: null, subtitle: null, linkUrl: null });
    });
});

describe('readingOrder', () => {
    test('sorts top to bottom then left to right and keeps array position as z', () => {
        const a = text({ id: 'a', y: 60, x: 5 } as Partial<Layer>);
        const b = text({ id: 'b', y: 10, x: 50 } as Partial<Layer>);
        const c = text({ id: 'c', y: 10, x: 5 } as Partial<Layer>);
        expect(readingOrder([a, b, c]).map(({ layer, z }) => [layer.id, z])).toEqual([
            ['c', 3],
            ['b', 2],
            ['a', 1],
        ]);
    });
});

describe('type scale', () => {
    test('every kind has exactly sm/md/lg, increasing, and defaults are on the scale', () => {
        for (const [kind, steps] of Object.entries(TYPE_SCALE)) {
            expect(Object.keys(steps)).toEqual(['sm', 'md', 'lg']);
            expect(steps.sm).toBeLessThan(steps.md);
            expect(steps.md).toBeLessThan(steps.lg);
            expect(steps[DEFAULT_SIZE[kind as keyof typeof DEFAULT_SIZE]]).toBeGreaterThan(0);
        }
    });

    test('legacy sizes map to the nearest step per element kind', () => {
        expect(normalizeSize('button', '3xl')).toBe('lg');
        expect(normalizeSize('button', 'xs')).toBe('sm');
        expect(normalizeSize('heading', '2xl')).toBe('md');
        expect(normalizeSize('heading', 'xs')).toBe('sm');
        expect(normalizeSize('badge', 'xl')).toBe('lg');
        expect(normalizeSize('body', 'md')).toBe('md');
        expect(normalizeSize('subtitle', 'nope')).toBe('md');
        expect(normalizeSize('heading', 'lg')).toBe('lg');
    });

    test('old-format documents load, in both parsers, and are saved in the new form', () => {
        const old = { ...defaultLayer('button'), size: '3xl' };
        const raw = JSON.stringify({ v: 1, layers: [old, { ...defaultLayer('text'), size: '2xl' }] });
        for (const layers of [parseOverlay(raw), (parseOverlayStrict(raw) as { layers: Layer[] }).layers]) {
            expect(layers?.map((l) => (l as { size?: string }).size)).toEqual(['lg', 'md']);
        }
        expect(serializeOverlay(parseOverlay(raw) as Layer[])).not.toContain('3xl');
        expect(
            parseOverlayStrict(JSON.stringify({ v: 1, layers: [{ ...defaultLayer('button'), size: 'huge' }] })).ok,
        ).toBe(false);
    });
});
