import { defineMiddleware } from 'astro:middleware';
import { parseScope, resolveScope, SCOPE_COOKIE } from '@/lib/server/admin-scope';
import { auth } from '@/lib/server/auth';
import { db } from '@/lib/server/db';

const PROTECTED = [
    /^\/dashboard(\/|$)/,
    /^\/admin(\/|$)/,
    /^\/settings(\/|$)/,
    /^\/confirm-password$/,
    /^\/verify-email$/,
];
const SCOPED = [/^\/dashboard(\/|$)/, /^\/admin(\/|$)/, /^\/settings(\/|$)/];
const PRIVATE = [...PROTECTED, /^\/api\//, /^\/login$/, /^\/forgot-password$/, /^\/reset-password$/];

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const isAsset = pathname.startsWith('/_astro/') || pathname.startsWith('/storage/');

    if (!isAsset) {
        const session = await auth.api.getSession({ headers: context.request.headers });
        context.locals.user = session
            ? {
                  id: Number(session.user.id),
                  name: session.user.name,
                  email: session.user.email,
                  emailVerified: session.user.emailVerified,
                  role: (session.user.role as string | undefined) ?? 'department_user',
                  departmentId: session.user.departmentId == null ? null : Number(session.user.departmentId),
              }
            : null;
        context.locals.session = session?.session ?? null;
    } else {
        context.locals.user = null;
        context.locals.session = null;
    }

    if (!context.locals.user && PROTECTED.some((re) => re.test(pathname))) {
        const target = `/login?redirect=${encodeURIComponent(pathname + context.url.search)}`;
        return context.redirect(target, 302);
    }

    if (context.locals.user && SCOPED.some((re) => re.test(pathname))) {
        // Validated on every request: unknown ids fall back to `all`, department users ignore the cookie.
        const departments = await db.department.findMany({
            orderBy: { name: 'asc' },
            select: { id: true, name: true, slug: true, logoPath: true },
        });
        context.locals.adminDepartments = departments;
        context.locals.adminScope = resolveScope(
            context.locals.user,
            parseScope(context.cookies.get(SCOPE_COOKIE)?.value),
            departments,
        );
    }

    const response = await next();

    if (!response.headers.has('Cache-Control') && !isAsset) {
        const isPrivate =
            PRIVATE.some((re) => re.test(pathname)) || context.locals.user !== null || context.request.method !== 'GET';
        response.headers.set(
            'Cache-Control',
            isPrivate ? 'no-store' : 'public, max-age=60, stale-while-revalidate=600',
        );
    }
    if (PRIVATE.some((re) => re.test(pathname))) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
});
