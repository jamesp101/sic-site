import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db, dbProvider } from './db';
import { sendMail } from './mail';
import { hashPassword, verifyPassword } from './password';

export const CLIENT_IP_HEADER = 'x-sic-client-ip';
export const auth = betterAuth({
    appName: 'San Isidro College',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.SITE_URL,
    basePath: '/api/auth',
    database: prismaAdapter(db, { provider: dbProvider }),
    advanced: {
        // Keep numeric auto-increment IDs: posts/downloads FK users.id.
        database: { generateId: 'serial' },
        // Set server-side from Astro's clientAddress in src/pages/api/auth/[...all].ts.
        ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    emailAndPassword: {
        enabled: true,
        // Users are created by a superadmin only.
        disableSignUp: true,
        requireEmailVerification: false,
        minPasswordLength: 8,
        revokeSessionsOnPasswordReset: true,
        password: {
            hash: hashPassword,
            verify: ({ hash, password }) => verifyPassword(hash, password),
        },
        sendResetPassword: async ({ user, url }) => {
            await sendMail({
                to: user.email,
                subject: 'Reset your San Isidro College password',
                text: `Use this link to reset your password:\n\n${url}\n\nIf you did not request a reset, ignore this email.`,
            });
        },
    },
    emailVerification: {
        sendOnSignUp: false,
        sendVerificationEmail: async ({ user, url }) => {
            await sendMail({
                to: user.email,
                subject: 'Verify your email address',
                text: `Verify your email:\n\n${url}`,
            });
        },
    },
    user: {
        additionalFields: {
            role: { type: 'string', required: false, defaultValue: 'department_user', input: false },
            departmentId: { type: 'number', required: false, input: false },
        },
        changeEmail: { enabled: true },
        deleteUser: { enabled: true },
    },
    session: {
        // Fresh window for sensitive actions (password confirmation parity with Fortify: 3 h).
        freshAge: 60 * 60 * 3,
    },
    rateLimit: {
        enabled: true,
        window: 60,
        max: 100,
        customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
});

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession['user'];
