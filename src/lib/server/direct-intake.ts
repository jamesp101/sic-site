/**
 * The one check for an object a browser uploaded straight to storage under a key the server issued
 * (Downloads: `download-intake.ts`, videos: `video-intake.ts`). Free of `astro:*` imports.
 *
 * Order matters: owner (the key was issued to this user and has not expired), then the object
 * (exists, not empty, fits), and only then the claim. A missing object therefore does not burn the
 * claim, and an object that does not fit is removed once, by the one user who owned it.
 */
import { RequestError } from './request-error';

export const INVALID_UPLOAD = 'Invalid uploaded file.';

export interface DirectIntakeDeps {
    ownsPendingUpload(key: string, userId: number): Promise<boolean>;
    claimPendingUpload(key: string, userId: number): Promise<boolean>;
    headUpload(key: string): Promise<{ size: number } | null>;
    discardFiles(keys: readonly string[], context: string): Promise<void>;
}

export interface DirectIntakeOptions {
    /** The caller's check that `key` has the shape (prefix, extension) of a key it issues. */
    validKey: boolean;
    maxBytes: number;
    messages: { missing: string; empty: string; tooLarge: string };
    /** Names the rejected object in the cleanup log. */
    context: string;
}

const invalid = () => new RequestError('BAD_REQUEST', INVALID_UPLOAD);

/** Throws unless `key` is well-formed and an unexpired, unclaimed upload issued to `userId`. Does not consume it. */
export async function assertIssuedTo(
    deps: Pick<DirectIntakeDeps, 'ownsPendingUpload'>,
    userId: number,
    key: string,
    validKey: boolean,
): Promise<void> {
    if (!validKey || !(await deps.ownsPendingUpload(key, userId))) throw invalid();
}

/** Verifies the uploaded object and claims the pending upload (once, by its owner); the object is then kept. */
export async function claimUploadedObject(
    deps: DirectIntakeDeps,
    userId: number,
    key: string,
    options: DirectIntakeOptions,
): Promise<{ key: string; size: number }> {
    await assertIssuedTo(deps, userId, key, options.validKey);
    const uploaded = await deps.headUpload(key);
    if (!uploaded) throw new RequestError('BAD_REQUEST', options.messages.missing);
    if (uploaded.size <= 0 || uploaded.size > options.maxBytes) {
        // The claim is consumed so only the owner's rejected object is removed, once.
        if (await deps.claimPendingUpload(key, userId)) await deps.discardFiles([key], options.context);
        throw new RequestError('BAD_REQUEST', uploaded.size <= 0 ? options.messages.empty : options.messages.tooLarge);
    }
    if (!(await deps.claimPendingUpload(key, userId))) throw invalid();
    return { key, size: uploaded.size };
}
