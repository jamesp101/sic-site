import { describe, expect, it } from 'vite-plus/test';
import { hashPassword, verifyPassword } from './password';

// PHP password_hash('password', PASSWORD_BCRYPT, ['cost' => 12]) — what Laravel stores.
const LARAVEL_HASH = '$2y$12$QPl/Tlk58rBi2bTgbw7qSOXaRRxCYpZXMdwA73..fB2nZ4h76Ir8u';

describe('password', () => {
    it('verifies existing Laravel $2y$ hashes so users keep their passwords', async () => {
        expect(await verifyPassword(LARAVEL_HASH, 'password')).toBe(true);
        expect(await verifyPassword(LARAVEL_HASH, 'Password')).toBe(false);
    });

    it('round-trips new hashes at bcrypt cost 12', async () => {
        const hash = await hashPassword('secret123');
        expect(hash).toMatch(/^\$2[ab]\$12\$/);
        expect(await verifyPassword(hash, 'secret123')).toBe(true);
        expect(await verifyPassword(hash, 'secret124')).toBe(false);
    });
});
