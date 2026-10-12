import { describe, expect, it } from 'vite-plus/test';
import { providerFromUrl } from '../../../prisma/provider.mjs';

describe('providerFromUrl', () => {
    it('maps URL schemes to Prisma providers', () => {
        expect(providerFromUrl('file:./storage/dev.db')).toBe('sqlite');
        expect(providerFromUrl('mysql://u:p@localhost:3306/sic')).toBe('mysql');
        expect(providerFromUrl('mariadb://u:p@localhost:3306/sic')).toBe('mysql');
        expect(providerFromUrl('postgresql://u:p@localhost/sic')).toBe('postgresql');
        expect(providerFromUrl('postgres://u:p@localhost/sic')).toBe('postgresql');
    });

    it('rejects missing and unknown URLs', () => {
        expect(() => providerFromUrl(undefined)).toThrow('DATABASE_URL is not set');
        expect(() => providerFromUrl('mongodb://x')).toThrow('Unsupported DATABASE_URL scheme: mongodb');
    });
});
