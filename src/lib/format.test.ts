import { describe, expect, it } from 'vite-plus/test';
import { extensionOf, fileKind } from './files';
import { formatDate, formatDateRange, formatFileSize } from './format';

describe('formatDate', () => {
    it('formats in Asia/Manila regardless of host zone', () => {
        // 2026-08-15 23:30 UTC is already 16 Aug in Manila.
        expect(formatDate('2026-08-15T23:30:00Z')).toBe('August 16, 2026');
    });

    it('supports short months and time', () => {
        expect(formatDate(new Date('2026-08-15T00:00:00Z'), { short: true })).toBe('Aug 15, 2026');
        expect(formatDate('2026-08-15T05:00:00Z', { time: true })).toMatch(/1:00\s?pm/i);
    });

    it('returns an empty string for invalid dates', () => {
        expect(formatDate('nope')).toBe('');
    });
});

describe('formatDateRange', () => {
    it('collapses same-day ranges and falls back to one date', () => {
        expect(formatDateRange('2026-07-20T01:00:00Z', '2026-07-20T08:00:00Z')).toBe('July 20, 2026');
        expect(formatDateRange('2026-07-20T01:00:00Z', null)).toBe('July 20, 2026');
        expect(formatDateRange(null, null)).toBe('');
    });

    it('formats multi-day ranges with both ends', () => {
        const range = formatDateRange('2026-08-15T01:00:00Z', '2026-08-20T01:00:00Z');
        expect(range).toContain('15');
        expect(range).toContain('20');
        expect(range).toContain('2026');
    });
});

describe('formatFileSize', () => {
    it('scales units', () => {
        expect(formatFileSize(0)).toBe('0 B');
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(1536)).toBe('1.5 KB');
        expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
        expect(formatFileSize(3 * 1024 ** 3)).toBe('3 GB');
    });
});

describe('files', () => {
    it('extracts lower-case extensions', () => {
        expect(extensionOf('Report.FINAL.PDF')).toBe('pdf');
        expect(extensionOf('downloads/abc.xlsx')).toBe('xlsx');
        expect(extensionOf('noext')).toBe('');
        expect(extensionOf('.hidden')).toBe('');
    });

    it('classifies extensions', () => {
        expect(fileKind('pdf')).toBe('pdf');
        expect(fileKind('.DOCX')).toBe('doc');
        expect(fileKind('csv')).toBe('sheet');
        expect(fileKind('jpg')).toBe('image');
        expect(fileKind('zip')).toBe('archive');
        expect(fileKind('exe')).toBe('other');
        expect(fileKind('')).toBe('other');
    });
});
