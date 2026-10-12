// Single source of truth for picking the Prisma provider from DATABASE_URL.
// Used by prisma.config.ts, scripts/prisma-schema.mjs and src/lib/server/db.ts.

/** @typedef {'sqlite' | 'mysql' | 'postgresql'} DbProvider */

/**
 * @param {string | undefined} url
 * @returns {DbProvider}
 */
export function providerFromUrl(url) {
    if (!url) throw new Error('DATABASE_URL is not set');
    if (url.startsWith('file:')) return 'sqlite';
    if (url.startsWith('mysql://') || url.startsWith('mariadb://')) return 'mysql';
    if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'postgresql';
    throw new Error(`Unsupported DATABASE_URL scheme: ${url.split(':')[0]}`);
}

/** Native long-text type per provider; SQLite TEXT is unbounded already. */
export const LONG_TEXT = /** @type {const} */ ({
    sqlite: '',
    mysql: '@db.LongText',
    postgresql: '@db.Text',
});
