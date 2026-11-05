const TABBABLE =
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open panels, innermost last: only the innermost one keeps focus (a confirm dialog opened from a drawer). */
const open: HTMLElement[] = [];

function tabbables(root: HTMLElement): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.getClientRects().length > 0);
}

/**
 * Svelte action for a modal panel: moves focus in (unless something inside already has it), keeps Tab and
 * focus inside while it is the innermost open panel, and gives focus back to the element that had it
 * before the panel opened.
 */
export function focusScope(node: HTMLElement) {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open.push(node);
    if (!node.contains(document.activeElement)) (tabbables(node)[0] ?? node).focus();

    function onKeydown(event: KeyboardEvent) {
        if (event.key !== 'Tab') return;
        const items = tabbables(node);
        if (items.length === 0) {
            event.preventDefault();
            node.focus();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === node)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function onFocusin(event: FocusEvent) {
        if (open.at(-1) !== node) return;
        if (event.target instanceof Node && !node.contains(event.target)) (tabbables(node)[0] ?? node).focus();
    }

    node.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusin);
    return {
        destroy() {
            node.removeEventListener('keydown', onKeydown);
            document.removeEventListener('focusin', onFocusin);
            const wasInnermost = open.at(-1) === node;
            open.splice(open.indexOf(node), 1);
            // Give focus back only when it is still ours or lost; an outer panel or the page may have taken it.
            const focusLost = document.activeElement === document.body || node.contains(document.activeElement);
            if (wasInnermost && focusLost && previous?.isConnected) previous.focus();
        },
    };
}
