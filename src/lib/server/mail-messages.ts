/**
 * The text of every mail the site sends. Callers pass data only; delivery is `sendMail` in `mail.ts`.
 * Free of `astro:*` imports.
 */
import type { MailMessage } from './mail';

/** The link mail for a User who asked to reset their password. */
export function resetPasswordMessage(to: string, url: string): MailMessage {
    return {
        to,
        subject: 'Reset your San Isidro College password',
        text: `Use this link to reset your password:\n\n${url}\n\nIf you did not request a reset, ignore this email.`,
    };
}

/** The link mail that verifies a User's email address. */
export function verifyEmailMessage(to: string, url: string): MailMessage {
    return {
        to,
        subject: 'Verify your email address',
        text: `Verify your email:\n\n${url}`,
    };
}

/** The warning sent to the User's previous address after their email address changed to `newEmail`. */
export function emailChangedMessage(previousEmail: string, newEmail: string): MailMessage {
    return {
        to: previousEmail,
        subject: 'Your San Isidro College email address was changed',
        text: `The email address of your San Isidro College account was changed to ${newEmail}.\n\nIf you did not make this change, contact the site administrator immediately.`,
    };
}

/** A contact-form submission, forwarded to the college. `name` and `subject` are already single-line. */
export function contactMessage(
    to: string,
    form: { name: string; email: string; subject: string; message: string },
): MailMessage {
    return {
        to,
        // Quotes and angle brackets cannot break out of the display name.
        replyTo: `${form.name.replace(/[<>"]/g, '')} <${form.email}>`,
        subject: `[Website contact] ${form.subject}`,
        text: `From: ${form.name} <${form.email}>\nSubject: ${form.subject}\n\n${form.message}\n`,
    };
}
