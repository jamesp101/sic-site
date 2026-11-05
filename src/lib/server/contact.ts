/**
 * The public contact form: input schema (single-line fields), honeypot, per-IP rate limit and the
 * mail to send. Free of `astro:*` imports; the action only delivers the result.
 */
import { z } from 'astro/zod';
import type { MailMessage } from './mail';
import { consumeRateLimit, RATE_LIMITS } from './rate-limit';
import { RequestError } from './request-error';

const oneLine = (max: number, message: string) =>
    z
        .string()
        .trim()
        .min(1, message)
        .max(max, `Please keep this under ${max} characters.`)
        .transform((value) => value.replace(/[\r\n]+/g, ' '));

export const contactInput = z.object({
    name: oneLine(255, 'Please enter your name.'),
    email: z
        .string()
        .trim()
        .min(1, 'Please enter your email address.')
        .max(255)
        .pipe(z.email('Enter a valid email address.')),
    subject: oneLine(255, 'Please enter a subject.'),
    message: z
        .string()
        .trim()
        .min(10, 'Please write at least 10 characters.')
        .max(5000, 'Please keep your message under 5000 characters.'),
    /** Honeypot: real visitors never see or fill this. */
    website: z.string().optional(),
});

export type ContactInput = z.output<typeof contactInput>;

/**
 * The mail to send for a contact submission, or null when nothing should be sent (a bot filled the
 * honeypot and gets a normal-looking success). Throws TOO_MANY_REQUESTS past the per-address limit.
 */
export async function contactMail(input: ContactInput, clientAddress: string, to: string): Promise<MailMessage | null> {
    if (input.website) return null;
    if (!(await consumeRateLimit(`contact:${clientAddress}`, RATE_LIMITS.contact))) {
        throw new RequestError('TOO_MANY_REQUESTS', 'Too many messages from your network. Please try again later.');
    }
    return {
        to,
        replyTo: `${input.name.replace(/[<>"]/g, '')} <${input.email}>`,
        subject: `[Website contact] ${input.subject}`,
        text: `From: ${input.name} <${input.email}>\nSubject: ${input.subject}\n\n${input.message}\n`,
    };
}
