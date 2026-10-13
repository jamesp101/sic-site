import { dbProvider } from './db';

/**
 * Case-insensitive substring filter for Prisma string fields. SQLite and MySQL compare ASCII
 * case-insensitively already; PostgreSQL needs `mode: 'insensitive'` (ILIKE).
 */
export function textContains(value: string): { contains: string; mode?: 'insensitive' } {
    return dbProvider === 'postgresql' ? { contains: value, mode: 'insensitive' } : { contains: value };
}
