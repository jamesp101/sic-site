/// <reference types="astro/client" />

declare namespace App {
    interface Locals {
        user: {
            id: number;
            name: string;
            email: string;
            emailVerified: boolean;
            role: string;
            departmentId: number | null;
        } | null;
        session: { id: string | number; expiresAt: Date; createdAt: Date } | null;
    }
    interface SessionData {
        flash: { type: 'success' | 'error'; message: string };
        passwordConfirmedAt: number;
    }
}
