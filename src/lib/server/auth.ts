import 'dotenv/config';
import { waitUntil } from '@vercel/functions';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { MIN_PASSWORD_LENGTH } from '../password-policy';
import { db, dbProvider } from './db';
import { sendMail } from './mail';
import { resetPasswordMessage, verifyEmailMessage } from './mail-messages';
import { hashPassword, verifyPassword } from './password';
import { consumeSignInAttempt } from './rate-limit';

export const CLIENT_IP_HEADER = 'x-sic-client-ip';

/**
 * Better Auth endpoints the app does not use. Account changes (password, email, profile, deletion, sessions)
 * go through `actions/account.ts`, which checks the current password, keeps the last Superadmin and applies the
 * app's own rate limits; the built-in routes would bypass all of that. Only what the sign-in, sign-out, password
 * reset and verification forms call stays reachable. (`auth.api.*` calls on the server are unaffected.)
 */
const DISABLED_PATHS = [
    '/change-email',
    '/change-password',
    '/update-user',
    '/update-session',
    '/delete-user',
    '/delete-user/callback',
    '/verify-password',
    '/list-sessions',
    '/revoke-session',
    '/revoke-sessions',
    '/revoke-other-sessions',
    '/sign-up/email',
    '/sign-in/social',
    '/link-social',
    '/list-accounts',
    '/unlink-account',
    '/refresh-token',
    '/get-access-token',
    '/account-info',
];

const baseURL = process.env.BETTER_AUTH_URL ?? process.env.SITE_URL;

/** Emailed links must point at the configured origin, never one derived from request headers. */
function requireBaseUrl(): void {
    if (!baseURL && process.env.NODE_ENV === 'production') {
        throw new Error('Set BETTER_AUTH_URL or SITE_URL before sending account emails.');
    }
}

export const auth = betterAuth({
    appName: 'San Isidro College',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: '/api/auth',
    disabledPaths: DISABLED_PATHS,
    hooks: {
        // Per-account limit on top of the per-IP rule below: a botnet cannot spread guesses over one email.
        // Runs for every sign-in, whether posted by the login form's fetch or by `/login` (auth-session.ts).
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== '/sign-in/email') return;
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            if (typeof email === 'string' && !(await consumeSignInAttempt(email))) {
                throw new APIError('TOO_MANY_REQUESTS', { message: 'Too many attempts. Please try again later.' });
            }
        }),
    },
    database: prismaAdapter(db, { provider: dbProvider }),
    advanced: {
        // Keep numeric auto-increment IDs: posts/downloads FK users.id.
        database: { generateId: 'serial' },
        // Set server-side from Astro's clientAddress in src/pages/api/auth/[...all].ts.
        ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
        // Reset/verification mail is sent after the response, so response time does not reveal whether
        // an address has an account. `waitUntil` keeps Vercel functions alive; Node just lets it run.
        backgroundTasks: { handler: (promise) => waitUntil(promise) },
    },
    emailAndPassword: {
        enabled: true,
        // Users are created by a superadmin only.
        disableSignUp: true,
        requireEmailVerification: false,
        minPasswordLength: MIN_PASSWORD_LENGTH,
        revokeSessionsOnPasswordReset: true,
        password: {
            hash: hashPassword,
            verify: ({ hash, password }) => verifyPassword(hash, password),
        },
        sendResetPassword: async ({ user, url }) => {
            requireBaseUrl();
            await sendMail(resetPasswordMessage(user.email, url));
        },
    },
    emailVerification: {
        sendOnSignUp: false,
        sendVerificationEmail: async ({ user, url }) => {
            requireBaseUrl();
            await sendMail(verifyEmailMessage(user.email, url));
        },
    },
    user: {
        additionalFields: {
            role: { type: 'string', required: false, defaultValue: 'department_user', input: false },
            departmentId: { type: 'number', required: false, input: false },
        },
        // No changeEmail/deleteUser endpoints: email changes and account deletion go through
        // actions/account.ts, which require the current password and keep the last superadmin (user-rules.ts).
    },
    session: {
        // Fresh window for sensitive actions (password confirmation parity with Fortify: 3 h).
        freshAge: 60 * 60 * 3,
    },
    rateLimit: {
        enabled: true,
        // Shared across instances (serverless): counters live in `auth_rate_limits`.
        storage: 'database',
        window: 60,
        max: 100,
        customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];
