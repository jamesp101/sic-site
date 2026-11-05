import { describe, expect, it, vi } from 'vite-plus/test';
import { createUnsavedGuard, isPlainPrimaryClick, type Held } from './unsaved-guard';

const click = (over: Partial<MouseEvent> = {}) =>
    ({
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        target: {},
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        ...over,
    }) as unknown as MouseEvent;

/** Whether the fake event's `preventDefault` spy was called. */
const wasPrevented = (event: object): boolean =>
    (Reflect.get(event, 'preventDefault') as { mock: { calls: unknown[] } }).mock.calls.length > 0;

const form = (own = false) =>
    ({ closest: () => (own ? {} : null), requestSubmit: vi.fn() }) as unknown as HTMLFormElement;
const submit = (target: HTMLFormElement) =>
    ({ target, submitter: null, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as SubmitEvent;

function setup(dirty: boolean, link: URL | null = new URL('https://sic.test/admin/posts')) {
    const state = { dirty };
    const held: Held[] = [];
    const navigate = vi.fn(async () => {});
    const go = vi.fn();
    const guard = createUnsavedGuard({
        isDirty: () => state.dirty,
        onHold: (h) => held.push(h),
        navigate,
        linkAt: () => link,
        go,
        defer: (run) => run(),
    });
    return { state, held, navigate, go, guard };
}

const prepared = (over: { navigationType?: string; direction?: string } = {}) => ({
    preventDefault: vi.fn(),
    ...over,
});

describe('isPlainPrimaryClick', () => {
    it('is the unmodified left button only', () => {
        expect(isPlainPrimaryClick(click())).toBe(true);
        expect(isPlainPrimaryClick(click({ button: 1 }))).toBe(false);
        for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const)
            expect(isPlainPrimaryClick(click({ [key]: true }))).toBe(false);
    });
});

describe('unsaved guard', () => {
    it('holds a plain link click while dirty and lets it through when clean', () => {
        const dirty = setup(true);
        const event = click();
        dirty.guard.click(event);
        expect(wasPrevented(event)).toBe(true);
        expect(dirty.held).toEqual([{ href: 'https://sic.test/admin/posts' }]);

        const clean = setup(false);
        const free = click();
        clean.guard.click(free);
        expect(wasPrevented(free)).toBe(false);
        expect(clean.held).toEqual([]);
    });

    it('ignores modified clicks and targets that are not plain links', () => {
        const { guard, held } = setup(true);
        guard.click(click({ ctrlKey: true }));
        expect(held).toEqual([]);
        const other = setup(true, null);
        other.guard.click(click());
        expect(other.held).toEqual([]);
    });

    it('holds other forms but never the guarded page’s own', () => {
        const { guard, held } = setup(true);
        const other = form();
        const event = submit(other);
        guard.submit(event);
        expect(wasPrevented(event)).toBe(true);
        expect(held).toEqual([{ form: other, submitter: null }]);

        const own = submit(form(true));
        guard.submit(own);
        expect(wasPrevented(own)).toBe(false);
        expect(held).toHaveLength(1);
    });

    it('asks before unload and cancels router navigations only while dirty', () => {
        const { guard, state } = setup(true);
        const unload = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
        guard.beforeUnload(unload);
        expect(wasPrevented(unload)).toBe(true);
        const prep = { preventDefault: vi.fn() };
        guard.preparation(prep);
        expect(wasPrevented(prep)).toBe(true);

        state.dirty = false;
        const quietUnload = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
        const quietPrep = { preventDefault: vi.fn() };
        guard.beforeUnload(quietUnload);
        guard.preparation(quietPrep);
        expect(wasPrevented(quietUnload)).toBe(false);
        expect(wasPrevented(quietPrep)).toBe(false);
    });

    it('proceed follows the held link without being held again, then guards again', async () => {
        const { guard, navigate } = setup(true);
        const during = { preventDefault: vi.fn() };
        navigate.mockImplementation(async () => guard.preparation(during));
        await guard.proceed({ href: 'https://sic.test/admin/posts' });
        expect(navigate).toHaveBeenCalledWith('https://sic.test/admin/posts');
        expect(wasPrevented(during)).toBe(false);

        const after = { preventDefault: vi.fn() };
        guard.preparation(after);
        expect(wasPrevented(after)).toBe(true);
    });

    it('proceed re-submits a held form and keeps the guard open for the router until the page settles', async () => {
        const { guard } = setup(true);
        // A valid form: requestSubmit fires its submit event, which the guard lets through to the router.
        const requestSubmit = vi.fn((_submitter: HTMLElement | null) => {
            const event = submit(target);
            guard.submit(event);
            expect(wasPrevented(event)).toBe(false);
        });
        const target = { closest: () => null, requestSubmit } as unknown as HTMLFormElement;
        await guard.proceed({ form: target, submitter: null });
        expect(requestSubmit).toHaveBeenCalledWith(null);
        const during = prepared();
        guard.preparation(during);
        expect(wasPrevented(during)).toBe(false);

        guard.settled();
        const after = prepared();
        guard.preparation(after);
        expect(wasPrevented(after)).toBe(true);
    });

    it('a held form the browser refuses to submit leaves the page guarded', async () => {
        const { guard } = setup(true);
        // An invalid form: requestSubmit fires no submit event.
        await guard.proceed({ form: form(), submitter: null });
        const prep = prepared();
        guard.preparation(prep);
        expect(wasPrevented(prep)).toBe(true);
        const unload = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
        guard.beforeUnload(unload);
        expect(wasPrevented(unload)).toBe(true);
    });

    it('does not ask the browser to confirm a navigation the user already discarded', async () => {
        const { guard, navigate } = setup(true);
        const during = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent;
        navigate.mockImplementation(async () => guard.beforeUnload(during));
        await guard.proceed({ href: 'https://sic.test/admin/posts' });
        expect(wasPrevented(during)).toBe(false);
    });

    it('puts the history back when a Back or Forward is held, and swallows that step’s popstate', () => {
        const { guard, go } = setup(true);
        const back = prepared({ navigationType: 'traverse', direction: 'back' });
        guard.preparation(back);
        expect(wasPrevented(back)).toBe(true);
        expect(go).toHaveBeenLastCalledWith(1);
        const own = { stopImmediatePropagation: vi.fn() };
        guard.popstate(own);
        expect(own.stopImmediatePropagation).toHaveBeenCalledTimes(1);
        // Only the guard's own step is swallowed; a later popstate belongs to the router.
        const later = { stopImmediatePropagation: vi.fn() };
        guard.popstate(later);
        expect(later.stopImmediatePropagation).not.toHaveBeenCalled();

        guard.preparation(prepared({ navigationType: 'traverse', direction: 'forward' }));
        expect(go).toHaveBeenLastCalledWith(-1);
        expect(go).toHaveBeenCalledTimes(2);
    });

    it('leaves the history alone for pushes, clean pages and unknown directions', () => {
        const { guard, go, state } = setup(true);
        guard.preparation(prepared({ navigationType: 'push', direction: 'forward' }));
        guard.preparation(prepared({ navigationType: 'traverse' }));
        state.dirty = false;
        const clean = prepared({ navigationType: 'traverse', direction: 'back' });
        guard.preparation(clean);
        expect(wasPrevented(clean)).toBe(false);
        expect(go).not.toHaveBeenCalled();
    });
});
