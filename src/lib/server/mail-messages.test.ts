import { describe, expect, it } from 'vite-plus/test';
import { contactMessage, emailChangedMessage, resetPasswordMessage, verifyEmailMessage } from './mail-messages';

describe('mail messages', () => {
    it('puts the link in the reset and verification mails', () => {
        const reset = resetPasswordMessage('ana@example.com', 'https://sic.test/reset?token=t');
        expect(reset).toMatchObject({ to: 'ana@example.com', subject: 'Reset your San Isidro College password' });
        expect(reset.text).toContain('https://sic.test/reset?token=t');

        const verify = verifyEmailMessage('ana@example.com', 'https://sic.test/verify');
        expect(verify).toMatchObject({ to: 'ana@example.com', subject: 'Verify your email address' });
        expect(verify.text).toContain('https://sic.test/verify');
    });

    it('sends the email-change warning to the previous address and names the new one', () => {
        const mail = emailChangedMessage('old@example.com', 'new@example.com');
        expect(mail.to).toBe('old@example.com');
        expect(mail.text).toContain('new@example.com');
    });

    it('builds the contact mail with a reply-to that cannot break out of the display name', () => {
        const mail = contactMessage('office@sic.test', {
            name: 'A"<na>',
            email: 'ana@example.com',
            subject: 'Hello',
            message: 'A message.',
        });
        expect(mail).toMatchObject({
            to: 'office@sic.test',
            replyTo: 'Ana <ana@example.com>',
            subject: '[Website contact] Hello',
        });
        expect(mail.text).toBe('From: A"<na> <ana@example.com>\nSubject: Hello\n\nA message.\n');
    });
});
