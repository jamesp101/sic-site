/**
 * Unsaved-changes guard, driven by a dirty flag (`isDirty`). While dirty it holds back what would leave the page
 * and hands it to `onHold` to ask the user; `proceed` then performs the held navigation.
 *
 * ClientRouter navigation cannot be cancelled cleanly once the router sees it, so plain link clicks and form
 * submits are held earlier, by capture-phase listeners. What still reaches the router (a programmatic
 * `navigate()`, back/forward) is handed to the browser with `astro:before-preparation`'s `preventDefault`, which
 * makes the router do a full navigation that `beforeunload` then asks about. Closing the tab asks the same way.
 *
 * Back/forward needs one more step: the browser has already moved to the other history entry when the router
 * sees the popstate, so after "Keep editing" the address bar would show a page that is not on screen. The guard
 * therefore steps the history back (`history.go(1)` after a Back, `go(-1)` after a Forward) once the router has
 * made its hand-over (a timer, so the `beforeunload` question is answered first). That step fires a second
 * popstate, which the guard swallows so the router never turns it into a navigation to the page already shown.
 *
 * Free of `astro:*` and Svelte; `components/admin/shared/UnsavedChangesGuard.svelte` wires it up.
 */
import { plainLinkAt } from '@/lib/link-intent';

/** Forms (or any ancestors) marked with this attribute belong to the guarded page: their own submit is never held. */
export const OWN_FORM_SELECTOR = '[data-unsaved-own]';

/** A navigation or form submit held back until the user decides. */
export type Held = { href: string } | { form: HTMLFormElement; submitter: HTMLElement | null };

export interface UnsavedGuardOptions {
    isDirty: () => boolean;
    onHold: (held: Held) => void;
    /** Client-side navigation (`navigate` from `astro:transitions/client`). */
    navigate: (href: string) => Promise<unknown>;
    /** Plain link under an event target, or null; replaceable in tests. */
    linkAt?: (target: EventTarget | null) => URL | null;
    /** History traversal (`history.go`); replaceable in tests. */
    go?: (delta: number) => void;
    /** Runs a function after the current event has been handled (a zero timer); replaceable in tests. */
    defer?: (run: () => void) => void;
}

/** The part of `astro:before-preparation` the guard reads. */
export interface PreparationEvent extends Pick<Event, 'preventDefault'> {
    navigationType?: string;
    direction?: string;
}

/** A primary-button click without modifiers: the kind that navigates in the same tab. */
export function isPlainPrimaryClick(
    event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function createUnsavedGuard(options: UnsavedGuardOptions) {
    const linkAt = options.linkAt ?? plainLinkAt;
    const go = options.go ?? ((delta: number) => history.go(delta));
    const defer = options.defer ?? ((run: () => void) => void setTimeout(run, 0));
    /** Set while a confirmed discard is leaving, so the guard lets that navigation through. */
    let discarding = false;
    /** The held form being re-submitted: `submit` until its submit event arrives, then `navigation` until it settles. */
    let resubmitting: { form: HTMLFormElement; stage: 'submit' | 'navigation' } | null = null;
    /** A history step the guard made itself is on its way; its popstate is swallowed. */
    let restoring = false;
    const holding = () => options.isDirty() && !discarding;

    function click(event: MouseEvent): void {
        if (!holding() || !isPlainPrimaryClick(event)) return;
        const url = linkAt(event.target);
        if (!url) return;
        event.preventDefault();
        event.stopPropagation();
        options.onHold({ href: url.href });
    }

    function submit(event: SubmitEvent): void {
        const form = event.target as HTMLFormElement;
        if (resubmitting?.form === form && resubmitting.stage === 'submit') resubmitting.stage = 'navigation';
        if (!holding() || form.closest(OWN_FORM_SELECTOR)) return;
        event.preventDefault();
        event.stopPropagation();
        options.onHold({ form, submitter: event.submitter });
    }

    function beforeUnload(event: BeforeUnloadEvent): void {
        if (holding()) event.preventDefault();
    }

    function preparation(event: PreparationEvent): void {
        if (!holding()) return;
        event.preventDefault();
        if (event.navigationType !== 'traverse') return;
        // The router now hands the traversal to the browser; put the history back once that has been answered.
        const delta = event.direction === 'back' ? 1 : event.direction === 'forward' ? -1 : 0;
        if (delta === 0) return;
        defer(() => {
            if (!options.isDirty()) return;
            restoring = true;
            go(delta);
        });
    }

    /** Swallows the popstate of the guard's own history step so the router does not navigate on it. */
    function popstate(event: Pick<Event, 'stopImmediatePropagation'>): void {
        if (!restoring) return;
        restoring = false;
        event.stopImmediatePropagation();
    }

    /** A navigation finished (the page was swapped or loaded): a held submit has settled, so the guard is back. */
    function settled(): void {
        discarding = false;
        resubmitting = null;
        restoring = false;
    }

    /** Leaves for good: the held link is followed, or the held form is submitted as it was. */
    async function proceed(held: Held): Promise<void> {
        discarding = true;
        if ('href' in held) {
            try {
                await options.navigate(held.href);
            } finally {
                discarding = false;
            }
        } else {
            // The router handles the submit asynchronously and replaces the page, so the guard stays open until
            // `settled`. A form the browser refuses to submit (it is invalid) fires no submit event: nothing is
            // leaving, so the guard closes again at once.
            resubmitting = { form: held.form, stage: 'submit' };
            held.form.requestSubmit(held.submitter);
            if (resubmitting?.stage === 'submit') settled();
        }
    }

    /** Starts listening; returns the function that stops. */
    function install(): () => void {
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', click, true);
        document.addEventListener('submit', submit, true);
        document.addEventListener('astro:before-preparation', preparation);
        window.addEventListener('popstate', popstate, true);
        document.addEventListener('astro:after-swap', settled);
        document.addEventListener('astro:page-load', settled);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', click, true);
            document.removeEventListener('submit', submit, true);
            document.removeEventListener('astro:before-preparation', preparation);
            window.removeEventListener('popstate', popstate, true);
            document.removeEventListener('astro:after-swap', settled);
            document.removeEventListener('astro:page-load', settled);
        };
    }

    return { click, submit, beforeUnload, preparation, popstate, settled, proceed, install };
}
