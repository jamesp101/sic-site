import { describe, expect, it, vi } from 'vite-plus/test';
import { focusTarget, submitActionForm, type ActionFormState } from './action-form-core';
import type { FormErrors } from './form-utils';

const fresh = (): ActionFormState => ({ processing: false, errors: { stale: 'x' }, message: 'stale' });
const parse = (error: unknown): FormErrors => ({ fields: { name: String(error) }, message: 'general' });

describe('submitActionForm', () => {
    it('records parsed field and general errors and clears processing', async () => {
        const state = fresh();
        const onSuccess = vi.fn();
        await submitActionForm(state, { run: async () => ({ error: 'bad' }), onSuccess, parse });
        expect(state).toEqual({ processing: false, errors: { name: 'bad' }, message: 'general' });
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('shows a local failure without parsing', async () => {
        const state = fresh();
        const spy = vi.fn(parse);
        await submitActionForm(state, {
            run: async () => ({ failure: { fields: { url: 'Bad url' } } }),
            onSuccess: vi.fn(),
            parse: spy,
        });
        expect(state).toEqual({ processing: false, errors: { url: 'Bad url' }, message: '' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('clears processing and reports the message when run throws', async () => {
        const state = fresh();
        const onSuccess = vi.fn();
        await submitActionForm(state, {
            run: async () => {
                throw new Error('offline');
            },
            onSuccess,
            parse,
        });
        expect(state).toEqual({ processing: false, errors: {}, message: 'offline' });
        expect(onSuccess).not.toHaveBeenCalled();
    });

    it('stays processing until onSuccess settles, calling it once', async () => {
        const state = fresh();
        let during: boolean | null = null;
        const onSuccess = vi.fn(async () => {
            during = state.processing;
        });
        await submitActionForm(state, { run: async () => ({}), onSuccess, parse });
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(during).toBe(true);
        expect(state).toEqual({ processing: false, errors: {}, message: '' });
    });
});

describe('focusTarget', () => {
    it('prefers the first invalid field, then the form alert, else nothing', () => {
        expect(focusTarget({ field: 'field', alert: 'alert' })).toBe('field');
        expect(focusTarget({ field: null, alert: 'alert' })).toBe('alert');
        expect(focusTarget({ field: null, alert: null })).toBeNull();
    });
});
