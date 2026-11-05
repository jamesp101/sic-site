import { describe, expect, it } from 'vite-plus/test';
import { providerFromUrl, renderSchema } from '../../../prisma/provider.mjs';

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

describe('renderSchema', () => {
    const base = [
        'generator client {',
        '  provider = "prisma-client"',
        '  output   = "../src/generated/prisma"',
        '}',
        'datasource db {',
        '  provider = "{{provider}}"',
        '}',
        'model Post {',
        '  title      String',
        '  slug       String    @unique',
        '  subtitle   String?',
        '  url        String?   @map("url") {{text}}',
        '  content    String {{longtext}}',
        '  searchText String    @default("") @map("search_text") {{longtext}}',
        '  strings    StringSet',
        '  order      Int       @default(0)',
        '}',
    ].join('\n');
    const field = (schema: string, name: string) =>
        schema.split('\n').find((line) => line.trim().startsWith(`${name} `));

    it('gives MySQL VARCHAR(255) by default, TEXT for {{text}} and LONGTEXT for {{longtext}}', () => {
        const out = renderSchema(base, 'mysql');
        expect(out).toContain('provider = "mysql"');
        expect(field(out, 'title')).toMatch(/String @db\.VarChar\(255\)$/);
        expect(field(out, 'slug')).toMatch(/@unique @db\.VarChar\(255\)$/);
        expect(field(out, 'subtitle')).toMatch(/String\? @db\.VarChar\(255\)$/);
        expect(field(out, 'url')).toMatch(/@map\("url"\) @db\.Text$/);
        expect(field(out, 'content')).toMatch(/String @db\.LongText$/);
        expect(field(out, 'searchText')).toMatch(/@map\("search_text"\) @db\.LongText$/);
        expect(field(out, 'strings')).not.toContain('@db.');
        expect(field(out, 'order')).not.toContain('@db.');
    });

    it('leaves SQLite and PostgreSQL strings untyped apart from long text', () => {
        for (const provider of ['sqlite', 'postgresql'] as const) {
            const out = renderSchema(base, provider);
            expect(out).not.toContain('{{');
            expect(field(out, 'title')).toMatch(/String$/);
            expect(field(out, 'url')).toMatch(/@map\("url"\)$/);
        }
        expect(field(renderSchema(base, 'postgresql'), 'content')).toMatch(/@db\.Text$/);
        expect(field(renderSchema(base, 'sqlite'), 'content')).toMatch(/String$/);
    });

    it('can point the client at another output directory', () => {
        expect(renderSchema(base, 'sqlite', { output: '../src/generated/prisma-sqlite' })).toContain(
            'output   = "../src/generated/prisma-sqlite"',
        );
    });
});
