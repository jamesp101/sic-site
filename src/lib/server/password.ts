import bcrypt from 'bcryptjs';

/** Laravel writes `$2y$` bcrypt hashes; bcryptjs expects `$2a$`/`$2b$`. Same algorithm. */
export function normalizeBcrypt(hash: string): string {
    return hash.startsWith('$2y$') ? `$2b$${hash.slice(4)}` : hash;
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
    return bcrypt.compare(password, normalizeBcrypt(hash));
}
