import { describe, expect, it } from 'vite-plus/test';
import { parseActionError } from './form-utils';

const failure = (code: string, message: string) => ({ type: 'AstroActionError', code, message });
const inputError = (issues: { path: string[]; message: string }[]) => ({ type: 'AstroActionInputError', issues });
const byCode = { CONFLICT: 'email', BAD_REQUEST: 'currentPassword' };

describe('parseActionError', () => {
    it('puts an error whose code is mapped on its field', () => {
        expect(parseActionError(failure('CONFLICT', 'Email taken.'), byCode)).toEqual({
            fields: { email: 'Email taken.' },
            message: '',
        });
        expect(parseActionError(failure('BAD_REQUEST', 'Wrong password.'), byCode)).toEqual({
            fields: { currentPassword: 'Wrong password.' },
            message: '',
        });
    });

    it('keeps unmapped codes as the form-level message', () => {
        expect(parseActionError(failure('FORBIDDEN', 'Not allowed.'), byCode)).toEqual({
            fields: {},
            message: 'Not allowed.',
        });
        expect(parseActionError(failure('CONFLICT', 'Taken.'))).toEqual({ fields: {}, message: 'Taken.' });
    });

    it('uses the first input issue per field, ignoring the code map', () => {
        const error = inputError([
            { path: ['name'], message: 'Required' },
            { path: ['name'], message: 'Too short' },
            { path: [], message: 'Bad form' },
        ]);
        expect(parseActionError(error, byCode)).toEqual({ fields: { name: 'Required' }, message: 'Bad form' });
    });
});
