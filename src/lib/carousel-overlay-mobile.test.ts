import { describe, expect, test } from 'vite-plus/test';
import { defaultLayer, readingOrder, type Layer } from './carousel-overlay';
import {
    FRAME_H_PER_W,
    MIN_CQW,
    MOBILE_BOTTOM,
    MOBILE_MARGIN,
    MOBILE_TOP,
    MOBILE_TYPE_SCALE,
    countLines,
    hasMobileOverride,
    mobileSize,
    resetMobile,
    resolveMobile,
    setMobile,
    stepDown,
    type MobileBox,
} from './carousel-overlay-mobile';

let counter = 0;
const make = (type: Layer['type'], over: Record<string, unknown> = {}): Layer =>
    ({ ...defaultLayer(type), id: `t${++counter}`, ...over }) as Layer;

const heading = (text = 'Welcome to San Isidro College', over = {}) => make('text', { text, ...over });
const subtitle = (text = 'A school that forms hearts and minds', over = {}) =>
    make('text', { role: 'subtitle', size: 'md', font: 'sans', text, y: 55, ...over });
const button = (over = {}) => make('button', { y: 74, ...over });
const badge = (over = {}) => make('badge', { y: 26, ...over });
const logo = (over = {}) => make('image', { src: '/storage/carousels/a.webp', alt: 'Logo', y: 8, ...over });
const panel = (over = {}) => make('shape', over);

const visible = (layers: Layer[]) => {
    const boxes = resolveMobile(layers);
    return layers.flatMap((layer) => {
        const box = boxes.get(layer.id) as MobileBox;
        return box.hidden ? [] : [{ layer, box }];
    });
};

function expectNoOverlap(items: { layer: Layer; box: MobileBox }[]) {
    for (const [i, a] of items.entries()) {
        for (const b of items.slice(i + 1)) {
            const apart =
                a.box.x + a.box.w <= b.box.x + 1e-6 ||
                b.box.x + b.box.w <= a.box.x + 1e-6 ||
                a.box.y + a.box.h <= b.box.y + 1e-6 ||
                b.box.y + b.box.h <= a.box.y + 1e-6;
            expect(apart, `${a.layer.id} overlaps ${b.layer.id}`).toBe(true);
        }
    }
}

function expectInsideFrame(items: { layer: Layer; box: MobileBox }[]) {
    for (const { layer, box } of items) {
        expect(box.x, layer.id).toBeGreaterThanOrEqual(0);
        expect(box.y, layer.id).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w, layer.id).toBeLessThanOrEqual(100 + 1e-6);
        expect(box.y + box.h, layer.id).toBeLessThanOrEqual(100 - MOBILE_BOTTOM + 0.01);
    }
}

describe('countLines', () => {
    test('wraps words greedily', () => {
        expect(countLines('aaa bbb ccc', 7)).toBe(2);
        expect(countLines('aaa bbb ccc', 11)).toBe(1);
        expect(countLines('one\ntwo', 20)).toBe(2);
    });

    test('breaks words longer than a line', () => {
        expect(countLines('a'.repeat(25), 10)).toBe(3);
        expect(countLines('hi ' + 'a'.repeat(25), 10)).toBe(4);
    });
});

describe('phone sizes', () => {
    test('every step is at least 12 px on a 320 px phone', () => {
        for (const steps of Object.values(MOBILE_TYPE_SCALE)) {
            for (const cqw of Object.values(steps)) expect((cqw * 320) / 100).toBeGreaterThanOrEqual(12);
        }
        expect(MIN_CQW * 3.2).toBeGreaterThanOrEqual(12);
    });

    test('desktop sizes step down a notch, an override wins', () => {
        expect(stepDown('lg')).toBe('md');
        expect(stepDown('md')).toBe('sm');
        expect(stepDown('sm')).toBe('sm');
        expect(mobileSize(heading('x', { size: 'lg' }))).toBe('md');
        expect(mobileSize(heading('x', { size: 'lg', mobile: { size: 'lg' } }))).toBe('lg');
        expect(mobileSize(panel())).toBeNull();
    });
});

describe('resolveMobile: automatic stack', () => {
    const slide = () => [badge(), heading(), subtitle(), button()];

    test('keeps reading order, full width inside the margins, no overlaps, inside the frame', () => {
        const layers = slide();
        const items = visible(layers);
        expect(items).toHaveLength(4);
        const order = readingOrder(layers).map(({ layer }) => layer.id);
        expect([...items].sort((a, b) => a.box.y - b.box.y).map((item) => item.layer.id)).toEqual(order);
        for (const { layer, box } of items) {
            expect(box.auto).toBe(true);
            expect(box.x).toBe(MOBILE_MARGIN);
            if (layer.type === 'text') expect(box.w).toBe(100 - 2 * MOBILE_MARGIN);
        }
        expectNoOverlap(items);
        expectInsideFrame(items);
    });

    test('is bottom-aligned above the controls', () => {
        const items = visible(slide());
        const bottom = Math.max(...items.map(({ box }) => box.y + box.h));
        expect(bottom).toBeCloseTo(100 - MOBILE_BOTTOM, 1);
    });

    test('text sizes are one notch below desktop', () => {
        const items = visible([heading('Hi', { size: 'lg' })]);
        expect(items[0].box.fs).toBe(MOBILE_TYPE_SCALE.heading.md);
    });

    test('skips hidden layers and desktop panels', () => {
        const hidden = subtitle('x', { mobile: { hidden: true } });
        const layers = [panel(), heading(), hidden, button()];
        const boxes = resolveMobile(layers);
        expect(boxes.get(layers[0].id)?.hidden).toBe(true);
        expect(boxes.get(hidden.id)?.hidden).toBe(true);
        const items = visible(layers);
        expect(items.map((item) => item.layer.type)).toEqual(['text', 'button']);
        expectNoOverlap(items);
    });

    test('hiding a layer frees its space', () => {
        const layers = slide();
        const before = resolveMobile(layers);
        const after = resolveMobile(
            layers.map((layer) => (layer.type === 'badge' ? setMobile(layer, { hidden: true }) : layer)),
        );
        const headingId = layers[1].id;
        expect(after.get(headingId)?.y).toBeGreaterThan(before.get(headingId)?.y as number);
    });

    test('a logo keeps its aspect ratio and stays narrow', () => {
        const items = visible([logo({ w: 20, h: 18 }), heading()]);
        const image = items.find((item) => item.layer.type === 'image')?.box as MobileBox;
        expect(image.w).toBeLessThanOrEqual(40);
        const aspect = (20 * 16) / (18 * 9);
        expect(image.w / image.h / FRAME_H_PER_W).toBeCloseTo(aspect, 1);
        expectNoOverlap(items);
    });

    test('long content shrinks spacing and sizes to fit', () => {
        const long = 'Enrolment for the new school year is now open for all grade levels and strands. '.repeat(2);
        const layers = [
            badge(),
            heading('Join the San Isidro College family this school year and grow with us', { size: 'lg' }),
            subtitle(long, { y: 50, size: 'lg' }),
            button(),
            button({ label: 'Apply for admission today', y: 80 }),
        ];
        const items = visible(layers);
        expectNoOverlap(items);
        expectInsideFrame(items);
        for (const { box } of items) if (box.fs !== null) expect(box.fs).toBeGreaterThanOrEqual(MIN_CQW);
    });

    test('is deterministic and independent of array order', () => {
        const layers = slide();
        const forward = resolveMobile(layers);
        const reversed = resolveMobile([...layers].reverse());
        for (const layer of layers) expect(reversed.get(layer.id)).toEqual(forward.get(layer.id));
    });
});

describe('resolveMobile: overrides', () => {
    test('a placed layer keeps its box and is not auto', () => {
        const placed = heading('Hi', { mobile: { x: 10, y: 20, w: 70 } });
        const box = resolveMobile([placed]).get(placed.id) as MobileBox;
        expect(box).toMatchObject({ x: 10, y: 20, w: 70, auto: false, hidden: false, autoW: false });
    });

    test('an override size is used, a size-only override keeps the layer automatic', () => {
        const sized = heading('Hi', { size: 'sm', mobile: { size: 'lg' } });
        const box = resolveMobile([sized]).get(sized.id) as MobileBox;
        expect(box.auto).toBe(true);
        expect(box.fs).toBe(MOBILE_TYPE_SCALE.heading.lg);
    });

    test('stacked layers move below a hand-placed one', () => {
        const fixed = panel({ mobile: { x: 0, y: 60, w: 100, h: 20 } });
        const layers = [heading('Title'), fixed, button()];
        const items = visible(layers);
        expect(items.find((item) => item.layer === fixed)?.box.auto).toBe(false);
        expectNoOverlap(items);
    });

    test('hand-placed layers do not move when others change', () => {
        const placed = heading('Hi', { mobile: { x: 10, y: 20, w: 70 } });
        const a = resolveMobile([placed, button()]).get(placed.id);
        const b = resolveMobile([placed, button(), badge()]).get(placed.id);
        expect(a).toEqual(b);
    });

    test('a layer hidden on phones is hidden even when placed', () => {
        const layer = heading('Hi', { mobile: { x: 10, y: 20, w: 70, hidden: true } });
        expect(resolveMobile([layer]).get(layer.id)?.hidden).toBe(true);
    });
});

describe('mobile override helpers', () => {
    test('setMobile merges, drops undefined keys and removes an empty override', () => {
        const layer = heading();
        const placed = setMobile(layer, { x: 10, y: 10, w: 50 });
        expect(placed.mobile).toEqual({ x: 10, y: 10, w: 50 });
        expect(setMobile(placed, { size: 'sm' }).mobile).toEqual({ x: 10, y: 10, w: 50, size: 'sm' });
        expect(setMobile(placed, { x: undefined, y: undefined, w: undefined })).not.toHaveProperty('mobile');
        expect(layer).not.toHaveProperty('mobile');
    });

    test('resetMobile restores the automatic layout', () => {
        const layer = setMobile(heading(), { x: 10, y: 10, w: 50, hidden: true, size: 'sm' });
        expect(hasMobileOverride(layer)).toBe(true);
        const reset = resetMobile(layer);
        expect(hasMobileOverride(reset)).toBe(false);
        expect(reset).not.toHaveProperty('mobile');
    });
});

test('frame constants leave room for the stack', () => {
    expect(MOBILE_TOP + MOBILE_BOTTOM).toBeLessThan(40);
});
