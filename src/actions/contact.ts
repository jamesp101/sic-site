import { defineAction } from 'astro:actions';
import { CONTACT_TO_ADDRESS } from 'astro:env/server';
import { guarded } from '@/lib/server/action-guard';
import { contactInput, contactMail } from '@/lib/server/contact';
import { sendMail } from '@/lib/server/mail';

export const contact = {
    send: defineAction({
        accept: 'form',
        input: contactInput,
        handler: (input, context) =>
            guarded(async () => {
                const mail = await contactMail(input, context.clientAddress, CONTACT_TO_ADDRESS);
                if (mail) await sendMail(mail);
                return { sent: true };
            }),
    }),
};
