import { untrack } from 'svelte';

/**
 * Dirty flag for a form: `dirty` is true while `snapshot()` (read the form's fields, serialisable) differs from
 * the snapshot taken when the form was created or last saved. Call `markSaved()` once a save went through, before
 * navigating away. Hand `dirty` to `UnsavedChangesGuard`.
 */
export function unsavedChanges(snapshot: () => unknown) {
    const take = () => JSON.stringify(snapshot());
    let baseline = $state(untrack(take));
    return {
        get dirty() {
            return take() !== baseline;
        },
        markSaved() {
            baseline = take();
        },
    };
}
