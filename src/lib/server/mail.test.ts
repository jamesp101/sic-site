import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { sendMail } from './mail';

const message = { to: 'a@example.org', subject: 'Hello', text: 'Body' };

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe('sendMail with MAIL_MAILER=log', () => {
    it('prints the message outside production', async () => {
        vi.stubEnv('MAIL_MAILER', 'log');
        vi.stubEnv('NODE_ENV', 'development');
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        await sendMail(message);
        expect(info).toHaveBeenCalledWith(expect.stringContaining('subject=Hello'));
    });

    it('is refused in production, by name, without printing the message', async () => {
        vi.stubEnv('MAIL_MAILER', 'log');
        vi.stubEnv('NODE_ENV', 'production');
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        await expect(sendMail(message)).rejects.toThrow(/MAIL_MAILER=log is not allowed in production/);
        expect(info).not.toHaveBeenCalled();
    });

    it('is the default when MAIL_MAILER is unset, so production refuses that too', async () => {
        vi.stubEnv('MAIL_MAILER', undefined);
        vi.stubEnv('NODE_ENV', 'production');
        await expect(sendMail(message)).rejects.toThrow(/not allowed in production/);
    });
});
