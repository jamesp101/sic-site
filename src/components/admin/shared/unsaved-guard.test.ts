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
    const guard = createUnsavedGuard({
        isDirty: () => state.dirty,
        onHold: (h) => held.push(h),
        navigate,
        linkAt: () => link,
    });
    return { state, held, navigate, guard };
}

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

    it('proceed re-submits a held form and keeps the guard open for the router', async () => {
        const { guard } = setup(true);
        const requestSubmit = vi.fn();
        const held = { closest: () => null, requestSubmit } as unknown as HTMLFormElement;
        await guard.proceed({ form: held, submitter: null });
        expect(requestSubmit).toHaveBeenCalledWith(null);
        const prep = { preventDefault: vi.fn() };
        guard.preparation(prep);
        expect(wasPrevented(prep)).toBe(false);
    });
});
