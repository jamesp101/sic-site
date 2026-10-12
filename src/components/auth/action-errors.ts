import { isInputError } from 'astro:actions';

/** First message per field from an Astro action input error; empty for other errors. */
export function fieldErrors(error: unknown): Record<string, string> {
    if (!isInputError(error)) return {};
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(error.fields)) {
        const first = (messages as string[] | undefined)?.[0];
        if (first) out[key] = first;
    }
    return out;
}
