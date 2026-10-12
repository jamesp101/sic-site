import { defineAction } from 'astro:actions';
import { CONTACT_TO_ADDRESS } from 'astro:env/server';
import { z } from 'astro/zod';
import { sendMail } from '@/lib/server/mail';

const oneLine = (max: number, message: string) =>
    z
        .string()
        .trim()
        .min(1, message)
        .max(max, `Please keep this under ${max} characters.`)
        .transform((value) => value.replace(/[\r\n]+/g, ' '));

export const contact = {
    send: defineAction({
        accept: 'form',
        input: z.object({
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
        }),
        handler: async (input) => {
            // Bots that fill the honeypot get a normal-looking success and nothing is sent.
            if (input.website) return { sent: true };

            await sendMail({
                to: CONTACT_TO_ADDRESS,
                replyTo: `${input.name.replace(/[<>"]/g, '')} <${input.email}>`,
                subject: `[Website contact] ${input.subject}`,
                text: `From: ${input.name} <${input.email}>\nSubject: ${input.subject}\n\n${input.message}\n`,
            });
            return { sent: true };
        },
    }),
};
