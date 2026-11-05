import type { Page } from '@playwright/test';

/** A file part of a multipart action input. */
export interface FilePart {
    name: string;
    mimeType: string;
    buffer: Buffer;
}

/** An action's input: a JSON body or multipart fields (strings, numbers, booleans and files). */
export type ActionInput = { json: unknown } | { multipart: Record<string, string | number | boolean | FilePart> };

export interface ActionResult<T = unknown> {
    ok: boolean;
    status: number;
    /** The decoded result: `data` of a successful action, or the error body `{ type, code, message }`. */
    data: T;
    /** The raw response body. */
    text: string;
}

/**
 * Decodes a devalue payload (what Astro serialises action results with): `[{"id":1},5]` is `{ id: 5 }`.
 * Handles the value kinds action results contain (JSON values, `undefined`, `NaN`, infinities, `Date`).
 */
function devalueParse(payload: unknown[]): unknown {
    const specials: Record<number, unknown> = {
        [-1]: undefined,
        [-2]: NaN,
        [-3]: Infinity,
        [-4]: -Infinity,
        [-5]: -0,
    };
    const hydrated = new Map<number, unknown>();
    const revive = (index: number): unknown => {
        if (index in specials) return specials[index];
        if (hydrated.has(index)) return hydrated.get(index);
        const value = payload[index];
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            if (typeof value[0] === 'string') {
                if (value[0] !== 'Date') throw new Error(`Unsupported devalue type ${value[0]}`);
                const date = new Date(value[1]);
                hydrated.set(index, date);
                return date;
            }
            const list: unknown[] = [];
            hydrated.set(index, list);
            for (const item of value) list.push(revive(item));
            return list;
        }
        const object: Record<string, unknown> = {};
        hydrated.set(index, object);
        for (const [key, ref] of Object.entries(value)) object[key] = revive(ref as number);
        return object;
    };
    return revive(0);
}

function decode(text: string): unknown {
    if (!text) return undefined;
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return undefined;
    }
    return Array.isArray(parsed) ? devalueParse(parsed) : parsed;
}

/**
 * Posts the named Astro action (`posts.create`, `carousels.update`, …) with `page`'s session. The page must
 * have loaded a URL of the site; `T` is the result shape the caller expects (its origin becomes the Origin header Astro checks).
 */
export async function postAction<T = unknown>(
    page: Page,
    name: string,
    input: ActionInput = { json: {} },
): Promise<ActionResult<T>> {
    const response = await page.request.post(`/_actions/${name}`, {
        headers: { Origin: new URL(page.url()).origin },
        ...('json' in input ? { data: input.json } : { multipart: input.multipart }),
    });
    const text = await response.text();
    return { ok: response.ok(), status: response.status(), data: decode(text) as T, text };
}
