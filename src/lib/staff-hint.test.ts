import { describe, expect, it } from 'vite-plus/test';
import { hasStaffHint, staffHintAction } from './staff-hint';

describe('hasStaffHint', () => {
    it('finds the cookie among others', () => {
        expect(hasStaffHint('theme=dark; sic_staff=1; x=y')).toBe(true);
        expect(hasStaffHint('sic_staff=1')).toBe(true);
    });

    it('ignores absent or look-alike cookies', () => {
        expect(hasStaffHint('')).toBe(false);
        expect(hasStaffHint('theme=dark')).toBe(false);
        expect(hasStaffHint('not_sic_staff=1; sic_staff_x=1')).toBe(false);
    });
});

describe('staffHintAction', () => {
    const NO_STORE = 'private, no-store';
    const PUBLIC = 'public, max-age=60, s-maxage=60';

    it('sets the hint for a signed-in person without it, only on a no-store response', () => {
        expect(staffHintAction({ signedIn: true, hinted: false, cacheControl: NO_STORE })).toBe('set');
        expect(staffHintAction({ signedIn: true, hinted: false, cacheControl: PUBLIC })).toBeNull();
        expect(staffHintAction({ signedIn: true, hinted: false, cacheControl: null })).toBeNull();
    });

    it('deletes the hint for a signed-out person who has it, only on a no-store response', () => {
        expect(staffHintAction({ signedIn: false, hinted: true, cacheControl: 'no-store' })).toBe('delete');
        expect(staffHintAction({ signedIn: false, hinted: true, cacheControl: PUBLIC })).toBeNull();
    });

    it('does nothing when the hint already matches the session', () => {
        expect(staffHintAction({ signedIn: true, hinted: true, cacheControl: NO_STORE })).toBeNull();
        expect(staffHintAction({ signedIn: false, hinted: false, cacheControl: NO_STORE })).toBeNull();
    });
});
