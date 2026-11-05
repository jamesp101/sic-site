import 'dotenv/config';
import type { SqlDriverAdapterFactory } from '@prisma/client/runtime/client';
import { PrismaClient } from '@/generated/prisma/client';
import { providerFromUrl } from '../../../prisma/provider.mjs';

/**
 * Connections per process in the MariaDB/MySQL pool. Overridden by `DATABASE_POOL_SIZE` or a `connectionLimit`
 * query parameter in `DATABASE_URL`. Keep `instances × pool size` below the server's `max_connections`, and on
 * serverless (one pool per function instance) use a small value such as 1-3 or a pooling proxy.
 */
const MYSQL_POOL_SIZE = 5;

function mariadbUrl(url: string): string {
    const base = url.replace(/^mysql:/, 'mariadb:');
    if (/[?&]connectionLimit=/.test(base)) return base;
    const size = Number.parseInt(process.env.DATABASE_POOL_SIZE ?? '', 10) || MYSQL_POOL_SIZE;
    return `${base}${base.includes('?') ? '&' : '?'}connectionLimit=${size}`;
}

/** Driver adapter for the provider implied by DATABASE_URL; only the matching driver is loaded. */
async function createAdapter(url: string): Promise<SqlDriverAdapterFactory> {
    switch (providerFromUrl(url)) {
        case 'sqlite': {
            const { PrismaBetterSqlite3 } = await import('@prisma/adapter-better-sqlite3');
            return new PrismaBetterSqlite3({ url });
        }
        case 'mysql': {
            const { PrismaMariaDb } = await import('@prisma/adapter-mariadb');
            return new PrismaMariaDb(mariadbUrl(url));
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
