import { defineAction } from 'astro:actions';
import { z } from 'astro/zod';
import { actorOf, flash, guarded } from '@/lib/server/action-guard';
import { contentField } from '@/lib/server/content-field';
import { requireSuperAdmin } from '@/lib/server/authz';
import { db } from '@/lib/server/db';

const LANDING_SETTING_KEY = 'welcome_hero_content';

export const settings = {
    updateLanding: defineAction({
        input: z.object({ welcomeHeroContent: contentField({ required: false }).nullish() }),
        handler: (input, context) =>
            guarded(async () => {
                requireSuperAdmin(actorOf(context));
                const value = input.welcomeHeroContent ?? '';
                await db.setting.upsert({
                    where: { key: LANDING_SETTING_KEY },
                    create: { key: LANDING_SETTING_KEY, value },
                    update: { value },
                });
                flash(context, 'Landing page settings updated successfully.');
                return { saved: true };
            }),
    }),
};
