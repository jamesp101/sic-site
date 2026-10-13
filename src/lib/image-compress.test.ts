import { describe, expect, it } from 'vite-plus/test';
import { IMAGE_TARGETS, fitWithin, webpName } from './image-compress';

describe('fitWithin', () => {
    it('downscales into the box keeping the aspect ratio', () => {
        expect(fitWithin(4000, 3000, 1600, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3000, 4000, 1600, 1600)).toEqual({ width: 1200, height: 1600 });
        expect(fitWithin(3840, 2160, IMAGE_TARGETS.slide.maxWidth, IMAGE_TARGETS.slide.maxHeight)).toEqual({
            width: 1920,
            height: 1080,
        });
    });

    it('never upscales small images', () => {
        expect(fitWithin(300, 200, 1600, 1600)).toEqual({ width: 300, height: 200 });
    });

    it('keeps at least one pixel for extreme ratios', () => {
        expect(fitWithin(10000, 1, 512, 512)).toEqual({ width: 512, height: 1 });
    });
});

describe('webpName', () => {
    it('swaps the extension for .webp', () => {
        expect(webpName('Photo.JPG')).toBe('Photo.webp');
        expect(webpName('campus.day.png')).toBe('campus.day.webp');
        expect(webpName('scan')).toBe('scan.webp');
        expect(webpName('.png')).toBe('image.webp');
        expect(webpName('')).toBe('image.webp');
    });
});
