import { submitActionForm, type ActionFormCore, type ActionFormState } from './action-form-core';
import { parseActionError, type FormErrors } from './form-utils';

export interface ActionFormOptions {
    /** Calls the Astro action (and any pre-step such as a direct upload). Return `{ failure }` to reject locally. */
    run: ActionFormCore['run'];
    /** Runs once after success: `navigate(...)` or `reloadView()`. */
    onSuccess: ActionFormCore['onSuccess'];
    /** Field that receives CONFLICT messages (e.g. a unique name or email). */
    conflictField?: string;
    /** Custom error mapping; replaces `parseActionError`. */
    parse?: (error: unknown) => FormErrors;
}

/** Reactive submit state for admin forms: `{ processing, errors, message, submit }`; bind `submit` to `onsubmit`. */
export function actionForm(options: ActionFormOptions) {
    const state: ActionFormState = $state({ processing: false, errors: {}, message: '' });
    const parse = options.parse ?? ((error: unknown) => parseActionError(error, options.conflictField));
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
        submit(event?: Event): Promise<void> {
            event?.preventDefault();
            return submitActionForm(state, { run: options.run, onSuccess: options.onSuccess, parse });
        },
    };
}
