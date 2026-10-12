import 'dotenv/config';
import type { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';
import { PrismaClient } from '@/generated/prisma/client';
import { providerFromUrl } from '../../../prisma/provider.mjs';

/** Driver adapter for the provider implied by DATABASE_URL; only the matching driver is loaded. */
async function createAdapter(url: string): Promise<SqlDriverAdapterFactory> {
    switch (providerFromUrl(url)) {
        case 'sqlite': {
            const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
            return new PrismaBetterSqlite3({ url });
        }
        case 'mysql': {
            const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
            return new PrismaMariaDb(url.replace(/^mysql:/, 'mariadb:'));
        }
        case 'postgresql': {
            const { PrismaPg } = await import('@prisma/adapter-pg');
            return new PrismaPg({ connectionString: url });
        }
    }
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

export const dbProvider = providerFromUrl(url);

const globalForDb = globalThis as unknown as { __prisma?: PrismaClient };
// Reuse one client across Vite HMR reloads in dev.
export const db: PrismaClient = globalForDb.__prisma ?? new PrismaClient({ adapter: await createAdapter(url) });
globalForDb.__prisma = db;
