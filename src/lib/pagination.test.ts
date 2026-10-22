import { describe, expect, it } from 'vite-plus/test';
import { pageWindow, parsePage } from './pagination';

describe('parsePage', () => {
    it('reads positive integers', () => {
        expect(parsePage('3')).toBe(3);
        expect(parsePage('1')).toBe(1);
    });

    it('falls back to page 1 for missing or malformed values', () => {
        for (const value of [null, '', '0', '-2', '1.5', 'abc', '2abc', ' 2', '9999999']) {
            expect(parsePage(value), String(value)).toBe(1);
        }
    });
});

describe('pageWindow', () => {
    it('lists every page when there are few', () => {
        expect(pageWindow(1, 1)).toEqual([1]);
        expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('keeps first, last and the current neighbours with gaps between', () => {
        expect(pageWindow(1, 10)).toEqual([1, 2, null, 10]);
        expect(pageWindow(6, 10)).toEqual([1, null, 5, 6, 7, null, 10]);
        expect(pageWindow(10, 10)).toEqual([1, null, 9, 10]);
    });

    it('shows a single skipped page instead of an ellipsis', () => {
        expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, null, 10]);
        expect(pageWindow(7, 10)).toEqual([1, null, 6, 7, 8, 9, 10]);
    });
});
