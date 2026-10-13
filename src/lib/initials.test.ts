import { describe, expect, it } from 'vite-plus/test';
import { getInitials } from './initials';

describe('getInitials', () => {
    it('uses first and last name, skipping leading titles', () => {
        expect(getInitials('Prof. Juan Dela Cruz')).toBe('JC');
        expect(getInitials('Dr. Alan Turing')).toBe('AT');
        expect(getInitials('Engr Maria Santos')).toBe('MS');
        expect(getInitials('Ada Lovelace')).toBe('AL');
    });

    it('handles single words, titles only, and empty input', () => {
        expect(getInitials('Registrar')).toBe('R');
        expect(getInitials('Dr.')).toBe('D');
        expect(getInitials('   ')).toBe('');
        expect(getInitials(undefined)).toBe('');
    });
});
