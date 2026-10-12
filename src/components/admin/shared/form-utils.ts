import { isInputError } from 'astro:actions';

export const inputClass =
    'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground shadow-brand-sm outline-none placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-ring/40';

export const primaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-800 px-4 py-2 text-sm font-semibold text-white shadow-brand-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gold-500 dark:text-brand-950 dark:hover:bg-gold-400';

export const secondaryButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-alt';

export const dangerIconButtonClass =
    'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive';

export interface FormErrors {
    /** Field name -> first message. */
    fields: Record<string, string>;
    /** Message not tied to a field (authorization, conflicts, server errors). */
    message: string;
}

interface ActionFailure {
    code?: string;
    message?: string;
}

/** Splits an Astro action error into per-field messages and a general message. `conflictField` receives CONFLICT messages. */
export function parseActionError(error: unknown, conflictField?: string): FormErrors {
    const result: FormErrors = { fields: {}, message: '' };
    if (isInputError(error)) {
        for (const issue of error.issues) {
            const key = String(issue.path[0] ?? '');
            if (key && !(key in result.fields)) result.fields[key] = issue.message;
            else if (!key && !result.message) result.message = issue.message;
        }
        return result;
    }
    const failure = error as ActionFailure;
    const message = failure?.message || 'Something went wrong. Please try again.';
    if (conflictField && failure?.code === 'CONFLICT') result.fields[conflictField] = message;
    else result.message = message;
    return result;
}

export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Appends a value to FormData: null/undefined are skipped, booleans become "true"/"false". */
export function append(form: FormData, key: string, value: string | number | boolean | File | null | undefined): void {
    if (value === null || value === undefined) return;
    form.append(key, typeof value === 'boolean' ? String(value) : (value as string | Blob));
}
