/**
 * Unsaved-changes guard, driven by a dirty flag (`isDirty`). While dirty it holds back what would leave the page
 * and hands it to `onHold` to ask the user; `proceed` then performs the held navigation.
 *
 * ClientRouter navigation cannot be cancelled cleanly once the router sees it, so plain link clicks and form
 * submits are held earlier, by capture-phase listeners. What still reaches the router (a programmatic
 * `navigate()`, back/forward) is handed to the browser with `astro:before-preparation`'s `preventDefault`, which
 * makes the router do a full navigation that `beforeunload` then asks about. Closing the tab asks the same way.
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
}

/** A primary-button click without modifiers: the kind that navigates in the same tab. */
export function isPlainPrimaryClick(
    event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>,
): boolean {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function createUnsavedGuard(options: UnsavedGuardOptions) {
    const linkAt = options.linkAt ?? plainLinkAt;
    /** Set while a confirmed discard is leaving, so the guard lets that navigation through. */
    let discarding = false;
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
        if (!holding() || form.closest(OWN_FORM_SELECTOR)) return;
        event.preventDefault();
        event.stopPropagation();
        options.onHold({ form, submitter: event.submitter });
    }

    function beforeUnload(event: BeforeUnloadEvent): void {
        if (options.isDirty()) event.preventDefault();
    }

    function preparation(event: Pick<Event, 'preventDefault'>): void {
        if (holding()) event.preventDefault();
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
            // The router handles the submit asynchronously; the page is replaced, so the guard stays open.
            held.form.requestSubmit(held.submitter);
        }
    }

    /** Starts listening; returns the function that stops. */
    function install(): () => void {
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', click, true);
        document.addEventListener('submit', submit, true);
        document.addEventListener('astro:before-preparation', preparation);
        return () => {
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', click, true);
            document.removeEventListener('submit', submit, true);
            document.removeEventListener('astro:before-preparation', preparation);
        };
    }

    return { click, submit, beforeUnload, preparation, proceed, install };
}
