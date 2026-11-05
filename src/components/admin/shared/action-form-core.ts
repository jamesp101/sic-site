/** Pure submit state machine behind `actionForm` (kept free of runes and `astro:*` so it runs in unit tests). */

import type { FormErrors } from './form-utils';

export interface ActionFormState {
    processing: boolean;
    errors: Record<string, string>;
    message: string;
}

/** What `run` resolves to: an Astro action result, or a local rejection that never reached the server. */
export interface ActionFormOutcome {
    /** The `error` of an Astro action result. */
    error?: unknown;
    /** Client-side rejection (validation, failed pre-upload): shown as-is, `parse` is skipped. */
    failure?: Partial<FormErrors>;
}

export interface ActionFormCore {
    /** Performs the action call; omitted/undefined result counts as success. */
    run: () => Promise<ActionFormOutcome | void>;
    /** Runs once after a successful `run` (navigate / reloadView); the form stays `processing` until it settles. */
    onSuccess: () => unknown;
    /** Maps an action error to field/general messages. */
    parse: (error: unknown) => FormErrors;
}

/** Where focus goes after a failed submit: the first invalid field, else the form-level alert, else nowhere. */
export function focusTarget<T>(found: { field: T | null; alert: T | null }): T | null {
    return found.field ?? found.alert;
}

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

/** Resets the state, runs the action, and records errors; `processing` is always cleared at the end, even on a throw. */
export async function submitActionForm(state: ActionFormState, core: ActionFormCore): Promise<void> {
    state.processing = true;
    state.errors = {};
    state.message = '';
    try {
        const outcome = await core.run();
        if (outcome?.error || outcome?.failure) {
            const shown = outcome.failure ?? core.parse(outcome.error);
            state.errors = shown.fields ?? {};
            state.message = shown.message ?? '';
            return;
        }
        await core.onSuccess();
    } catch (thrown) {
        state.message = thrown instanceof Error && thrown.message ? thrown.message : FALLBACK_MESSAGE;
    } finally {
        state.processing = false;
    }
}
