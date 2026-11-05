import { tick } from 'svelte';
import { focusTarget, submitActionForm, type ActionFormCore, type ActionFormState } from './action-form-core';
import { parseActionError, type FieldByCode, type FormErrors } from './form-utils';

export interface ActionFormOptions {
    /** Calls the Astro action (and any pre-step such as a direct upload). Return `{ failure }` to reject locally. */
    run: ActionFormCore['run'];
    /** Runs once after success: `navigate(...)` or `reloadView()`. */
    onSuccess: ActionFormCore['onSuccess'];
    /** Field that receives each action error code that is not an input error (e.g. `{ CONFLICT: 'email' }`). */
    fieldByCode?: FieldByCode;
    /** Custom error mapping; replaces `parseActionError`. */
    parse?: (error: unknown) => FormErrors;
}

/** Reactive submit state for admin forms: `{ processing, errors, message, submit }`; bind `submit` to `onsubmit`. */
export function actionForm(options: ActionFormOptions) {
    const state: ActionFormState = $state({ processing: false, errors: {}, message: '' });
    const parse = options.parse ?? ((error: unknown) => parseActionError(error, options.fieldByCode));
    return {
        get processing() {
            return state.processing;
        },
        get errors() {
            return state.errors;
        },
        get message() {
            return state.message;
        },
        async submit(event?: Event): Promise<void> {
            event?.preventDefault();
            const form = event?.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
            await submitActionForm(state, { run: options.run, onSuccess: options.onSuccess, parse });
            if (form && (state.message || Object.keys(state.errors).length > 0)) {
                await tick();
                focusTarget({
                    field: form.querySelector<HTMLElement>('[aria-invalid="true"]'),
                    alert: form.querySelector<HTMLElement>('[data-form-message]'),
                })?.focus();
            }
        },
    };
}
