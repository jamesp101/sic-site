import { describe, expect, it } from 'vite-plus/test';
import { cookieValue } from './cookie-header';

describe('cookieValue', () => {
    it('reads one cookie among others, decoded', () => {
        expect(cookieValue('a=1; admin_scope=main; b=2', 'admin_scope')).toBe('main');
        expect(cookieValue('x=a%20b', 'x')).toBe('a b');
    });

    it('keeps an undecodable value as is and ignores look-alikes and absent cookies', () => {
        expect(cookieValue('x=%E0%A4%A', 'x')).toBe('%E0%A4%A');
        expect(cookieValue('not_x=1; x_y=2', 'x')).toBeUndefined();
        expect(cookieValue(null, 'x')).toBeUndefined();
        expect(cookieValue('', 'x')).toBeUndefined();
    });
});
