import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vite-plus/test';
import {
    FRAME_ASPECT_CLASS,
    HERO_HEIGHT,
    HERO_PHONE_IMAGE_WIDTH,
    PHONE_FRAME,
    PHONE_MAX_REM,
    WIDE_MIN_REM,
    heroImageSizes,
    layerPresentation,
    measureLayerBox,
    measureLayerBoxes,
} from './carousel-layout';
import { TYPE_SCALE, defaultLayer, type Layer } from './carousel-overlay';
import { resolveMobile, type MobileBox } from './carousel-overlay-mobile';

const src = fileURLToPath(new URL('../', import.meta.url));
const layoutCss = readFileSync(`${src}styles/slide-layout.css`, 'utf8');

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(`${path}/`);
        return /\.(svelte|astro|ts|css)$/.test(entry.name) ? [path] : [];
    });
}

describe('slide-layout.css agrees with the layout module', () => {
    test('phone breakpoint, frame and hero heights', () => {
        expect(layoutCss).toContain(`@media (max-width: ${PHONE_MAX_REM}rem)`);
        expect(layoutCss).toContain(`@container hero (max-width: ${PHONE_MAX_REM}rem)`);
        expect(layoutCss).toContain(`@media (min-width: ${WIDE_MIN_REM}rem)`);
        expect(layoutCss).toContain(`aspect-ratio: ${PHONE_FRAME.w} / ${PHONE_FRAME.h};`);
        expect(FRAME_ASPECT_CLASS.phone).toBe(`aspect-[${PHONE_FRAME.w}/${PHONE_FRAME.h}]`);
        expect(layoutCss).toMatch(new RegExp(`\\.slide-hero \\{[^}]*--hh: ${HERO_HEIGHT.tall.base}px`));
        expect(layoutCss).toMatch(new RegExp(`\\.slide-hero-short \\{\\s*--hh: ${HERO_HEIGHT.short.base}px`));
        expect(layoutCss).toMatch(
            new RegExp(`min-width[^{]*\\{\\s*\\.slide-hero \\{\\s*--hh: ${HERO_HEIGHT.tall.wide}px`),
        );
        expect(layoutCss).toMatch(new RegExp(`\\.slide-hero-short \\{\\s*--hh: ${HERO_HEIGHT.short.wide}px`));
    });

    test('no other source file hard-codes them', () => {
        const owners = ['carousel-layout.ts', 'carousel-layout.test.ts', 'slide-layout.css'];
        const offenders = sourceFiles(src)
            .filter((file) => !owners.some((owner) => file.endsWith(`/${owner}`)))
            .filter((file) =>
                /39\.99|aspect-\[4\/5\]|aspect-ratio: 4 \/ 5|--hh:|@container hero/.test(readFileSync(file, 'utf8')),
            )
            .map((file) => file.slice(src.length));
        expect(offenders).toEqual([]);
    });
});

describe('hero image sizes', () => {
    test('a phone hero draws the 16:9 photo as wide as its height requires', () => {
        // 500 px tall at 16:9 is 888.9 px; 400 px tall is 711.1 px.
        expect(HERO_PHONE_IMAGE_WIDTH).toEqual({ tall: 889, short: 712 });
    });

    test('sizes switch from the phone width to the viewport at the phone breakpoint', () => {
        expect(heroImageSizes(true)).toBe('(max-width: 39.99rem) 889px, 100vw');
        expect(heroImageSizes(false)).toBe('(max-width: 39.99rem) 712px, 100vw');
    });
});

describe('layerPresentation', () => {
    const heading: Layer = {
        ...defaultLayer('text'),
        id: 'h',
        x: 10,
        y: 20,
        w: 50,
        rotation: 5,
        opacity: 80,
        color: 'navy',
    } as Layer;
    const stacked: MobileBox = {
        x: 6,
        y: 40,
        w: 88,
        h: 10,
        autoW: true,
        autoH: true,
        fs: 7,
        hidden: false,
        auto: true,
    };

    test('public layers sit at their desktop box and carry the phone box as custom properties', () => {
        const look = layerPresentation(heading, 3, stacked, 'public');
        expect(look.style).toBe(
            `z-index:3;left:10%;top:20%;width:50%;opacity:0.8;transform:rotate(5deg);--fs:${TYPE_SCALE.heading.lg};--mx:6%;--my:40%;--mw:auto;--mh:auto;--mfs:7`,
        );
        expect(look.phoneClass).toBe('sl-m sl-mauto');
        expect(look.textColor).toBe('text-brand-800 sl-onphoto');
    });

    test('a hand-placed layer keeps its dark colour on phones; a hidden one is removed', () => {
        expect(layerPresentation(heading, 1, { ...stacked, auto: false }, 'public')).toMatchObject({
            phoneClass: 'sl-m ',
            textColor: 'text-brand-800',
        });
        expect(layerPresentation(heading, 1, { ...stacked, hidden: true }, 'public').phoneClass).toBe('sl-mhide');
    });

    test('the desktop preview ignores the phone box', () => {
        const look = layerPresentation(heading, 1, stacked, 'desktop');
        expect(look.style).not.toContain('--mx');
        expect(look.style).toContain('left:10%');
        expect(look).toMatchObject({ phoneClass: '', textColor: 'text-brand-800' });
    });

    test('the phone preview applies the phone box directly', () => {
        const look = layerPresentation(heading, 1, stacked, 'phone');
        expect(look.style).toBe('z-index:1;left:6%;top:40%;--fs:7');
        expect(look.textColor).toBe('text-white');
        const ghost = layerPresentation(heading, 1, { ...stacked, hidden: true }, 'phone');
        expect(ghost.style).toContain('opacity:0.3');
        expect(ghost.ghostClass).toContain('outline-dashed');
    });

    test('a layer of an automatic phone layout resolves the same box in preview and public', () => {
        const layers = [heading];
        const box = resolveMobile(layers).get('h') ?? null;
        expect(box).not.toBeNull();
        expect(layerPresentation(heading, 1, box, 'phone').style).toContain(`left:${box?.x}%`);
        expect(layerPresentation(heading, 1, box, 'public').style).toContain(`--mx:${box?.x}%`);
    });
});

describe('measuring', () => {
    const el = (left: number, top: number, width: number, height: number, id?: string, parent?: object) =>
        ({
            offsetLeft: left,
            offsetTop: top,
            offsetWidth: width,
            offsetHeight: height,
            dataset: { layerId: id },
            parentElement: parent,
        }) as unknown as HTMLElement;

    test('boxes are percentages of the stage', () => {
        const layer = el(100, 50, 200, 25, 'a');
        const stage = {
            clientWidth: 400,
            clientHeight: 200,
            querySelectorAll: () => [layer],
        } as unknown as HTMLElement;
        expect(measureLayerBoxes(stage)).toEqual({ a: { x: 25, y: 25, w: 50, h: 12.5 } });
        expect(measureLayerBox(el(100, 50, 200, 25, 'a', stage))).toEqual({ x: 25, y: 25, w: 50, h: 12.5 });
    });

    test('a stage without size measures nothing', () => {
        const stage = { clientWidth: 0, clientHeight: 0, querySelectorAll: () => [] } as unknown as HTMLElement;
        expect(measureLayerBoxes(stage)).toBeNull();
        expect(measureLayerBox(el(0, 0, 1, 1, 'a', stage))).toBeNull();
    });
});
