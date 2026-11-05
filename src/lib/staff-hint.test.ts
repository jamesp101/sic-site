import { describe, expect, it } from 'vite-plus/test';
import { hasStaffHint } from './staff-hint';

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
