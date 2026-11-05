import { describe, expect, it } from 'vite-plus/test';
import { MIN_ADMIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordMinHint, passwordTooShort } from './password-policy';

describe('password policy', () => {
    it('requires a longer password for the admin bootstrap than for Users', () => {
        expect(MIN_ADMIN_PASSWORD_LENGTH).toBeGreaterThan(MIN_PASSWORD_LENGTH);
    });

    it('words the error and the hint from the minimum', () => {
        expect(passwordTooShort()).toBe(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
        expect(passwordTooShort(MIN_ADMIN_PASSWORD_LENGTH)).toContain(String(MIN_ADMIN_PASSWORD_LENGTH));
        expect(passwordMinHint()).toBe(`Minimum ${MIN_PASSWORD_LENGTH} characters.`);
    });
});
