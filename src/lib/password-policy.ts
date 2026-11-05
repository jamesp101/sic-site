/**
 * The password policy, stated once. Shared by the actions, the Better Auth config, the admin bootstrap
 * and the forms' client-side hints, so it must stay free of server and `astro:*` imports.
 */

/** Minimum length of any User's password (set by a Superadmin, changed in settings, or reset by email). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Minimum length of the password given to `prisma/create-admin.ts`. Deliberately longer than
 * `MIN_PASSWORD_LENGTH`: that script creates or resets a production Superadmin from a shell, where no
 * one else reviews the choice, and a Superadmin can work on every Department.
 */
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

/** Longest password accepted when a User changes their own (also Better Auth's default maximum). */
export const MAX_PASSWORD_LENGTH = 128;

/** The error shown when a password is shorter than `min`. */
export function passwordTooShort(min: number = MIN_PASSWORD_LENGTH): string {
    return `The password must be at least ${min} characters.`;
}

/** The form hint that states the minimum. */
export function passwordMinHint(min: number = MIN_PASSWORD_LENGTH): string {
    return `Minimum ${min} characters.`;
}
