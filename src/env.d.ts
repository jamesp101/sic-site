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
        /** Resolved department scope (set for /dashboard, /admin, /settings when signed in). */
        adminScope: import('@/lib/server/admin-scope').AdminScope;
        adminDepartments: { id: number; name: string; slug: string; logoPath: string | null }[];
        session: { id: string | number; expiresAt: Date; createdAt: Date } | null;
    }
}
