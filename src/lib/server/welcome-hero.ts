/**
 * The Welcome hero: the rich content at the top of the home page, stored as the one Setting row under this key.
 * Everything that reads or writes it goes through here.
 */
import { db } from './db';

const KEY = 'welcome_hero_content';

/** The stored content, or null while none was ever saved. */
export async function getWelcomeHero(): Promise<string | null> {
    const row = await db.setting.findUnique({ where: { key: KEY }, select: { value: true } });
    return row?.value ?? null;
}

export async function setWelcomeHero(value: string): Promise<void> {
    await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}
