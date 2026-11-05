import { describe, expect, it } from 'vite-plus/test';
import { adminPage } from './admin-page';
import { adminRoute } from './api-route';
import { RequestError, type RequestErrorCode } from './request-error';

const admin = { id: 1, role: 'superadmin', departmentId: null };
const editor = { id: 2, role: 'department_user', departmentId: 10 };

describe('RequestError', () => {
    it.each<[RequestErrorCode, number]>([
        ['BAD_REQUEST', 400],
        ['UNAUTHORIZED', 401],
        ['FORBIDDEN', 403],
        ['NOT_FOUND', 404],
        ['CONFLICT', 409],
        ['UNPROCESSABLE_CONTENT', 422],
        ['TOO_MANY_REQUESTS', 429],
    ])('%s is HTTP %i', (code, status) => {
        expect(new RequestError(code, 'x').status).toBe(status);
    });

    it('has a readable default message for authorization failures', () => {
        expect(new RequestError('UNAUTHORIZED').message).toBe('Sign in required.');
        expect(new RequestError('FORBIDDEN').message).toBe('Forbidden.');
        expect(new RequestError('NOT_FOUND').message).toBe('Not found.');
    });
});

describe('adminRoute', () => {
    const route = (user: unknown, handler: Parameters<typeof adminRoute>[0]) =>
        adminRoute(handler)({
            request: new Request('http://localhost/api'),
            locals: { user },
        } as unknown as Parameters<ReturnType<typeof adminRoute>>[0]);

    it('rejects a signed-out request with 401 and a JSON message', async () => {
        const response = await route(null, async () => new Response('never'));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ message: 'Sign in required.' });
    });

    it('turns a thrown RequestError into its status and message', async () => {
        const response = await route(admin, async () => {
            throw new RequestError('UNPROCESSABLE_CONTENT', 'Too big.');
        });
        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ message: 'Too big.' });
    });

    it('passes the handler response through and rethrows unexpected errors', async () => {
        expect((await route(admin, async () => new Response(null, { status: 204 }))).status).toBe(204);
        await expect(
            route(admin, async () => {
                throw new Error('boom');
            }),
        ).rejects.toThrow('boom');
    });
});

describe('adminPage', () => {
    it('returns the actor, and the loaded row when asked', async () => {
        expect(await adminPage(editor)).toEqual({ actor: editor, row: undefined });
        expect(await adminPage(editor, { load: async (actor) => actor.departmentId })).toEqual({
            actor: editor,
            row: 10,
        });
    });

    it('answers 401 for a guest, 403 for a department user on a superadmin page', async () => {
        const guest = await adminPage(null);
        expect(guest).toBeInstanceOf(Response);
        expect((guest as Response).status).toBe(401);

        expect(((await adminPage(editor, { superAdmin: true })) as Response).status).toBe(403);
        expect(await adminPage(admin, { superAdmin: true })).toMatchObject({ actor: admin });
    });

    it('answers with the status of an error thrown while loading the row', async () => {
        const missing = await adminPage(admin, {
            load: () => {
                throw new RequestError('NOT_FOUND');
            },
        });
        expect(missing).toBeInstanceOf(Response);
        expect((missing as Response).status).toBe(404);
        expect(await (missing as Response).text()).toBe('Not found.');
    });

    it('rethrows errors that are not RequestErrors', async () => {
        await expect(
            adminPage(admin, {
                load: () => {
                    throw new Error('boom');
                },
            }),
        ).rejects.toThrow('boom');
    });
});
