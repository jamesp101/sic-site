import { defineMiddleware } from 'astro:middleware';
import { parseScope, resolveScope, SCOPE_COOKIE } from '@/lib/server/admin-scope';
import { getSession } from '@/lib/server/auth-session';
import { isSuperAdmin } from '@/lib/server/authz';
import { db } from '@/lib/server/db';
import { guardRequest, isAssetPath, responseHeaders } from '@/lib/server/request-policy';

export const onRequest = defineMiddleware(async (context, next) => {
    const { pathname } = context.url;
    const isAsset = isAssetPath(pathname);

    if (!isAsset) {
        const session = await getSession(context.request.headers);
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

    const guard = guardRequest(context.url, context.locals.user !== null);
    if (guard.redirect !== null) return context.redirect(guard.redirect, 302);

    if (context.locals.user && guard.scoped) {
        // Validated on every request: unknown ids fall back to `all`, department users ignore the cookie.
        // Only Superadmins get the switcher's full list; a Department user loads just their own Department.
        const user = context.locals.user;
        const departments = await db.department.findMany({
            where: isSuperAdmin(user) ? {} : { id: user.departmentId ?? -1 },
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

    const headers = responseHeaders({
        method: context.request.method,
        url: context.url,
        signedIn: context.locals.user !== null,
        hasCacheControl: response.headers.has('Cache-Control'),
        hasContentSecurityPolicy: response.headers.has('Content-Security-Policy'),
    });
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    return response;
});
