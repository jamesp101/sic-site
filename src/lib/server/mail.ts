import 'dotenv/config';
import nodemailer from 'nodemailer';

export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    replyTo?: string;
}

/** Sends via SMTP, or logs to the console when MAIL_MAILER=log (dev default). */
export async function sendMail(message: MailMessage): Promise<void> {
    const from = process.env.MAIL_FROM_ADDRESS ?? 'noreply@sic.edu.ph';
    if ((process.env.MAIL_MAILER ?? 'log') === 'log') {
        console.info(`[mail] from=${from} to=${message.to} subject=${message.subject}\n${message.text}`);
        return;
    }
    const transport = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT ?? 587),
        auth: process.env.MAIL_USERNAME
            ? { user: process.env.MAIL_USERNAME, pass: process.env.MAIL_PASSWORD }
            : undefined,
    });
    await transport.sendMail({ from, ...message });
}
