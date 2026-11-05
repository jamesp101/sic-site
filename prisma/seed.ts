/**
 * Seeds a fresh database with the content of the Laravel seeders
 * (DatabaseSeeder, SettingSeeder, HeroSectionSeeder).
 *
 *   tsx prisma/seed.ts [--if-empty]
 *
 * Skipped on purpose (no real asset / document exists for them):
 *  - image columns pointing at the non-existent /images/* files (stored as null)
 *  - carousel items (image_path is required; only /sic-seal.png exists, which is not a slide image)
 *  - downloads (the Laravel seeder wrote mock text files named *.pdf, not real documents)
 */
import { searchTextOf } from '../src/lib/blocks/content';
import { db } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/password';
import { setPasswordLogin } from '../src/lib/server/password-login';
import { slugify } from '../src/lib/server/slug';
import { setWelcomeHero } from '../src/lib/server/welcome-hero';
import {
    DEMO_DEPARTMENTS,
    DEMO_DOWNLOAD_NAV_CHILDREN,
    DEMO_HERO_SECTIONS,
    DEMO_MEMBERS,
    DEMO_POSTS,
    DEMO_USERS,
    WELCOME_HERO,
    assertLocalDatabase,
    seedPassword,
    type DemoDepartmentKey,
    type DemoHeroSection,
    type DemoMember,
    type DemoPost,
    type DemoUserKey,
} from './demo-data';

const ifEmpty = process.argv.includes('--if-empty');

async function createUser(data: {
    name: string;
    email: string;
    role: string;
    password: string;
    departmentId?: number;
}) {
    const hash = await hashPassword(data.password);
    return db.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                name: data.name,
                email: data.email,
                role: data.role,
                departmentId: data.departmentId ?? null,
                emailVerified: true,
                emailVerifiedAt: new Date(),
            },
        });
        await setPasswordLogin(tx, user.id, hash);
        return user;
    });
}

async function main() {
    assertLocalDatabase();
    if (ifEmpty && (await db.user.count()) > 0) {
        console.log('Database already has users; skipping seed (--if-empty).');
        return;
    }

    // 1. Navigation links
    await db.navigationLink.create({ data: { label: 'Home', url: '/', order: 1 } });
    await db.navigationLink.create({ data: { label: 'Departments', url: '#departments', order: 2 } });
    const downloadsNav = await db.navigationLink.create({ data: { label: 'Downloads', url: '/downloads', order: 3 } });
    for (const [index, label] of DEMO_DOWNLOAD_NAV_CHILDREN.entries()) {
        await db.navigationLink.create({
            data: { label, url: '/downloads', order: index + 1, parentId: downloadsNav.id },
        });
    }
    await db.navigationLink.create({ data: { label: 'Contact Us', url: '/contact', order: 4 } });

    // 2. Departments (logo_path null: /images/*-logo.svg do not exist)
    const departmentIds = {} as Record<DemoDepartmentKey, number>;
    for (const key of ['cit', 'cba', 'coe'] as const) {
        departmentIds[key] = (await db.department.create({ data: DEMO_DEPARTMENTS[key] })).id;
    }
    const departmentId = (key: DemoDepartmentKey | null) => (key ? departmentIds[key] : null);

    // 3. Users
    const passwords = {
        superAdmin: seedPassword('SEED_SUPERADMIN_PASSWORD'),
        cit: seedPassword('SEED_DEPARTMENT_PASSWORD'),
        cba: seedPassword('SEED_DEPARTMENT_PASSWORD'),
    } satisfies Record<DemoUserKey, string>;
    const userIds = {} as Record<DemoUserKey, number>;
    for (const key of ['superAdmin', 'cit', 'cba'] as const) {
        const { name, email, role, department } = DEMO_USERS[key];
        const user = await createUser({
            name,
            email,
            role,
            password: passwords[key],
            departmentId: departmentId(department) ?? undefined,
        });
        userIds[key] = user.id;
    }

    // 4. Carousel items: skipped (no real slide imagery exists).

    // 5. Posts (highlight images null: /images/post-*.jpg do not exist)
    for (const { department, author, ...post } of Object.values<DemoPost>(DEMO_POSTS)) {
        await db.post.create({
            data: {
                ...post,
                departmentId: departmentId(department),
                userId: userIds[author],
                slug: slugify(post.title),
                searchText: searchTextOf(post.content),
            },
        });
    }

    // 6. Members (image_path null: /images/member-*.jpg do not exist)
    const memberIds = new Map<string, number>();
    for (const [key, { department, parent, ...member }] of Object.entries<DemoMember>(DEMO_MEMBERS)) {
        const created = await db.member.create({
            data: {
                ...member,
                departmentId: departmentIds[department],
                parentId: parent ? memberIds.get(parent)! : null,
            },
        });
        memberIds.set(key, created.id);
    }

    // 7. Downloads: skipped (the Laravel seeder only wrote mock text files).

    // 8. Settings
    await setWelcomeHero(WELCOME_HERO);

    // 9. Hero sections
    await db.heroSection.createMany({
        data: Object.values<DemoHeroSection>(DEMO_HERO_SECTIONS).map(({ department, ...section }) => ({
            ...section,
            departmentId: departmentId(department),
            searchText: searchTextOf(section.content),
        })),
    });

    console.log('Seeded navigation, departments, users, posts, members, settings and hero sections.');
    console.log('NOTICE: carousel items and downloads were not seeded; real slide imagery and documents are required.');
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
