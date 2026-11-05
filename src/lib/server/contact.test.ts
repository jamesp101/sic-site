import { afterAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { closeTestDb } from './test-db';

vi.mock('./db', async () => ({ db: await (await import('./test-db')).openTestDb() }));

const { db } = await import('./db');
const { contactInput, contactMail } = await import('./contact');
const { RATE_LIMITS } = await import('./rate-limit');

afterAll(closeTestDb);
beforeEach(async () => {
    await db.rateLimit.deleteMany();
});

const form = { name: 'Ana', email: 'ana@example.com', subject: 'Hello', message: 'A message of some length.' };

describe('contactInput', () => {
    it('flattens line breaks in single-line fields so they cannot inject mail headers', () => {
        const parsed = contactInput.parse({ ...form, name: 'Ana\r\nBcc: x@evil.test', subject: 'Hi\nthere' });
        expect(parsed.name).toBe('Ana Bcc: x@evil.test');
        expect(parsed.subject).toBe('Hi there');
    });

    it('rejects a missing name and a too-short message', () => {
        expect(contactInput.safeParse({ ...form, name: ' ' }).success).toBe(false);
        expect(contactInput.safeParse({ ...form, message: 'short' }).success).toBe(false);
    });
});

describe('contactMail', () => {
    it('builds the mail with a reply-to that cannot break out of the display name', async () => {
        const mail = await contactMail(contactInput.parse({ ...form, name: 'A"<na>' }), '1.2.3.4', 'office@sic.test');
        expect(mail).toMatchObject({
            to: 'office@sic.test',
            replyTo: 'Ana <ana@example.com>',
            subject: '[Website contact] Hello',
        });
    });

    it('sends nothing, and spends no attempt, when the honeypot is filled', async () => {
        const input = contactInput.parse({ ...form, website: 'http://spam.test' });
        expect(await contactMail(input, '1.2.3.4', 'office@sic.test')).toBeNull();
        expect(await db.rateLimit.count()).toBe(0);
    });

    it('rejects an address that sends too many messages', async () => {
        const input = contactInput.parse(form);
        for (let i = 0; i < RATE_LIMITS.contact.max; i++) await contactMail(input, '1.2.3.4', 'office@sic.test');
        await expect(contactMail(input, '1.2.3.4', 'office@sic.test')).rejects.toMatchObject({
            code: 'TOO_MANY_REQUESTS',
        });
        await expect(contactMail(input, '5.6.7.8', 'office@sic.test')).resolves.not.toBeNull();
    });
});
