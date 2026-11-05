import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { contentField } from '@/lib/server/content-field';
import { requireSuperAdmin } from '@/lib/server/authz';
import { setWelcomeHero } from '@/lib/server/welcome-hero';

export const settings = {
    updateLanding: defineAction({
        input: z.object({ welcomeHeroContent: contentField({ required: false }).nullish() }),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                await setWelcomeHero(input.welcomeHeroContent ?? '');
                flash(context, 'Landing page settings updated successfully.');
                return { saved: true };
            }),
    }),
};
