// Single source of truth for picking the Prisma provider from DATABASE_URL and rendering the schema for it.
// Used by prisma.config.ts, scripts/prisma-schema.mjs, the SQLite client generator
// (src/lib/server/sqlite-client.mjs) and src/lib/server/db.ts.

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

/**
 * Native types of the column-type placeholders in schema.base.prisma, per provider. SQLite TEXT is
 * unbounded and PostgreSQL `String` is already TEXT.
 */
const PLACEHOLDER_TYPES = /** @type {const} */ ({
    sqlite: { longtext: '', text: '' },
    mysql: { longtext: '@db.LongText', text: '@db.Text' },
    postgresql: { longtext: '@db.Text', text: '' },
});

/** A `String` / `String?` field line without a native `@db.` type. */
const UNTYPED_STRING = /^(\s+\w+\s+String\??)(?=\s|$)(?![^\n]*@db\.)([^\n]*)$/gm;

/**
 * Renders schema.base.prisma for `provider`: fills `{{provider}}`, `{{longtext}}` and `{{text}}`. On MySQL
 * every other String becomes VARCHAR(255) (Prisma's default would be VARCHAR(191), shorter than the
 * 255-character limits the forms allow). `output` overrides the generated client's directory.
 *
 * @param {string} base
 * @param {DbProvider} provider
 * @param {{ output?: string }} [options]
 * @returns {string}
 */
export function renderSchema(base, provider, { output } = {}) {
    let schema = base.replaceAll('{{provider}}', provider);
    for (const [name, type] of Object.entries(PLACEHOLDER_TYPES[provider])) {
        schema = schema.replaceAll(` {{${name}}}`, type ? ` ${type}` : '');
    }
    if (provider === 'mysql') schema = schema.replace(UNTYPED_STRING, '$1$2 @db.VarChar(255)');
    if (output) schema = schema.replace(/^(\s*output\s*=\s*)"[^"]*"$/m, `$1"${output}"`);
    return schema;
}
