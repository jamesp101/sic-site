import type { Appearance, ResolvedAppearance } from '@/types';

export type { Appearance, ResolvedAppearance };

const STORAGE_KEY = 'appearance';

const appearance = $state<{ value: Appearance }>({ value: 'system' });

let mediaQuery: MediaQueryList | null = null;

const prefersDark = (): boolean =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

const isDark = (value: Appearance): boolean => value === 'dark' || (value === 'system' && prefersDark());

const applyTheme = (value: Appearance): void => {
    if (typeof document === 'undefined') return;
    const dark = isDark(value);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
};

const readStored = (): Appearance => {
    if (typeof window === 'undefined') return 'system';
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
};

const onSystemChange = (): void => applyTheme(appearance.value);

const detach = (): void => {
    mediaQuery?.removeEventListener('change', onSystemChange);
    mediaQuery = null;
};

/** Syncs state with localStorage (the inline script in BaseLayout already applied the class) and follows OS changes. */
export function initializeTheme(): () => void {
    if (typeof window === 'undefined') return () => {};
    appearance.value = readStored();
    applyTheme(appearance.value);
    detach();
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', onSystemChange);
    return detach;
}

export function updateAppearance(value: Appearance): void {
    appearance.value = value;
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
    applyTheme(value);
}

export function themeState() {
    return {
        appearance,
        resolvedAppearance: (): ResolvedAppearance => (isDark(appearance.value) ? 'dark' : 'light'),
        updateAppearance,
    };
}
