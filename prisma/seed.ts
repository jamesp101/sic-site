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
import { db } from '../src/lib/server/db';
import { hashPassword } from '../src/lib/server/password';

const ifEmpty = process.argv.includes('--if-empty');

function slugify(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function seedPassword(envName: string): string {
    const value = process.env[envName];
    if (value) return value;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${envName} must be set when seeding in production`);
    }
    return 'password';
}

/** Laravel stored these wall-clock times in the app timezone (Asia/Manila). */
const manila = (local: string) => new Date(`${local.replace(' ', 'T')}+08:00`);

async function createUser(data: {
    name: string;
    email: string;
    role: string;
    password: string;
    departmentId?: number;
}) {
    const hash = await hashPassword(data.password);
    const user = await db.user.create({
        data: {
            name: data.name,
            email: data.email,
            role: data.role,
            departmentId: data.departmentId ?? null,
            emailVerified: true,
            emailVerifiedAt: new Date(),
            password: hash,
        },
    });
    await db.account.create({
        data: { userId: user.id, accountId: String(user.id), providerId: 'credential', password: hash },
    });
    return user;
}

const WELCOME_HERO = `# Welcome to San Isidro College

<Center>
Empowering minds, cultivating values, and inspiring service since 1949.
</Center>

<Flex>
<Card title="Academic Programs">
Explore our comprehensive collegiate courses and find the perfect path for your future career.
</Card>
<Card title="Campus Life">
Join student organizations, varsity sports, and artistic groups to build lifelong connections.
</Card>
</Flex>

<Accordion title="Learn More About SIC">
San Isidro College is a Catholic diocesan educational institution located in Malaybalay City, Bukidnon, Philippines. We are committed to developing students with strong values, academic excellence, and a passion for community service.
</Accordion>

<Badges>Values, Excellence, Service, Innovation</Badges>`;

async function main() {
    if (ifEmpty && (await db.user.count()) > 0) {
        console.log('Database already has users; skipping seed (--if-empty).');
        return;
    }

    // 1. Navigation links
    await db.navigationLink.create({ data: { label: 'Home', url: '/', order: 1 } });
    await db.navigationLink.create({ data: { label: 'Departments', url: '#departments', order: 2 } });
    const downloadsNav = await db.navigationLink.create({ data: { label: 'Downloads', url: '/downloads', order: 3 } });
    await db.navigationLink.create({
        data: { label: 'Student Handbook', url: '/downloads', order: 1, parentId: downloadsNav.id },
    });
    await db.navigationLink.create({
        data: { label: 'Academic Calendars', url: '/downloads', order: 2, parentId: downloadsNav.id },
    });
    await db.navigationLink.create({ data: { label: 'Contact Us', url: '/contact', order: 4 } });

    // 2. Departments (logo_path null: /images/*-logo.svg do not exist)
    const cit = await db.department.create({
        data: {
            name: 'College of Information Technology',
            slug: 'cit',
            description:
                'Empowering the next generation of technology leaders through innovative curricula, hands-on programming labs, and industry-partnered software engineering projects.',
            heroContent:
                '# Lead the Digital Frontier\n\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**. Our graduates are globally competitive, highly technical, and values-driven professionals.\n\n### Why Choose CIT?\n- **Modern Laboratories:** Equipped with high-spec developer environments.\n- **Industry Integration:** Internships with top-tier technology firms.\n- **Research Focused:** Active publication in artificial intelligence and systems design.',
        },
    });
    const cba = await db.department.create({
        data: {
            name: 'College of Business Administration',
            slug: 'cba',
            description:
                'Developing ethical business leaders, entrepreneurs, and financial managers who drive sustainable economic growth and societal progress.',
            heroContent:
                '# Shape the Future of Commerce\n\nAt the College of Business Administration, we foster entrepreneurship, strategic marketing, and ethical leadership. We prepare students for the complexities of global trade, digital finance, and corporate management.\n\n### Key Highlights\n- **Business Incubator:** Pitch, prototype, and launch your own startup.\n- **Case-Study Method:** Learn through real-world corporate challenges.\n- **Global Networking:** Mentorship programs with successful alumni business owners.',
        },
    });
    await db.department.create({
        data: {
            name: 'College of Education',
            slug: 'coe',
            description:
                'Nurturing compassionate educators, curriculum developers, and academic leaders dedicated to transformative learning experiences.',
            heroContent:
                "# Inspire Through Transformative Education\n\nThe College of Education is the cornerstone of San Isidro College's academic legacy. We combine pedagogical theory with extensive classroom practice to shape teachers who inspire and lead.\n\n### Specializations Offered\n- **Elementary Education:** Child development and fundamental learning systems.\n- **Secondary Education:** Math, Science, English, and Social Studies majors.\n- **Special Needs Education:** Inclusive teaching and learning strategies.",
        },
    });

    // 3. Users
    const superPassword = seedPassword('SEED_SUPERADMIN_PASSWORD');
    const deptPassword = seedPassword('SEED_DEPARTMENT_PASSWORD');
    const superAdmin = await createUser({
        name: 'Dr. Maria Clara (Super Admin)',
        email: 'admin@email.com',
        role: 'superadmin',
        password: superPassword,
    });
    const citAdmin = await createUser({
        name: 'Prof. Juan Dela Cruz (CIT Admin)',
        email: 'cit@sic.edu',
        role: 'department_user',
        password: deptPassword,
        departmentId: cit.id,
    });
    const cbaAdmin = await createUser({
        name: 'Dr. Jose Rizal (CBA Admin)',
        email: 'cba@sic.edu',
        role: 'department_user',
        password: deptPassword,
        departmentId: cba.id,
    });

    // 4. Carousel items: skipped (no real slide imagery exists).

    // 5. Posts (highlight images null: /images/post-*.jpg do not exist)
    const posts = [
        {
            title: 'SIC Enrolment Guide for First Semester 2026-2027',
            content:
                "# Complete Enrolment Steps\n\nWelcome to San Isidro College! Follow this simple guide to complete your registration.\n\n### Step 1: Admissions Review\nSubmit your transcript, birth certificate, and high school diploma to the Registrar Office.\n\n### Step 2: Faculty Evaluation\nVisit your department dean's office for academic advising and course scheduling.\n\n### Step 3: Payment & Verification\nPay your tuition fee at the Cashier's Desk or online bank transfer, then check your portal.",
            type: 'announcement',
            startDate: null,
            endDate: null,
            departmentId: null,
            userId: superAdmin.id,
            isFeatured: true,
        },
        {
            title: '74th Foundation Week Celebration',
            content:
                '# Celebrate with Pride!\n\nOur annual Foundation Week features sports events, music festivals, food trucks, and academic debates.\n\n### Schedule of Key Events\n- **August 15:** Grand Opening Parade (8:00 AM)\n- **August 17:** College Quiz Bee & IT Hackathon Exhibition\n- **August 19:** Alumni Dinner Dance & Gala Concert\n- **August 20:** Awarding Ceremony & Fireworks Display',
            type: 'event',
            startDate: manila('2026-08-15 08:00:00'),
            endDate: manila('2026-08-20 22:00:00'),
            departmentId: null,
            userId: superAdmin.id,
            isFeatured: true,
        },
        {
            title: 'CIT Unveils New AI Research Laboratory',
            content:
                '# Leading the Future of AI\n\nThe College of Information Technology is excited to announce the official opening of the AI Research Lab. Sponsored by local tech alumni, the lab houses top-tier GPUs to support student research in computer vision, large language models, and IoT automation.\n\nDean Del Cruz expressed his excitement:\n> "This laboratory provides our software engineering students with the computing power needed to solve real-world problems using machine learning."',
            type: 'article',
            startDate: null,
            endDate: null,
            departmentId: cit.id,
            userId: citAdmin.id,
            isFeatured: false,
        },
        {
            title: 'CIT Tech Seminar: Quantum Computing Basics',
            content:
                '# Join the Seminar!\n\nLearn the fundamentals of quantum gates, superposition, and next-generation cryptography in this introductory seminar led by guest speakers from global technology firms.\n\n### Details\n- **Room:** CIT Lab 3\n- **Duration:** 3 Hours\n- **Prerequisites:** Basic understanding of algebra and Boolean logic.',
            type: 'event',
            startDate: manila('2026-07-20 13:00:00'),
            endDate: manila('2026-07-20 16:00:00'),
            departmentId: cit.id,
            userId: citAdmin.id,
            isFeatured: false,
        },
        {
            title: 'CBA Students Win National Entrepreneurship Award',
            content:
                '# Championing Innovation\n\nA team of three senior Business Administration students won first place at the National Business Innovation Pitch for their sustainable urban agriculture platform. The startup secures seed funding and office space inside the SIC Business Incubator.\n\n### Winning Team Members\n- **Juan Luna** (Finance)\n- **Ana Maria** (Marketing)\n- **Luis Miguel** (Operations)',
            type: 'article',
            startDate: null,
            endDate: null,
            departmentId: cba.id,
            userId: cbaAdmin.id,
            isFeatured: false,
        },
    ];
    for (const post of posts) {
        await db.post.create({ data: { ...post, slug: slugify(post.title) } });
    }

    // 6. Members (image_path null: /images/member-*.jpg do not exist)
    const member = (name: string, role: string, departmentId: number, parentId: number | null, order: number) =>
        db.member.create({ data: { name, role, departmentId, parentId, order } });

    const citDean = await member('Prof. Juan Dela Cruz', 'Dean, College of IT', cit.id, null, 1);
    const citCSHead = await member('Dr. Alan Turing', 'Head of Computer Science', cit.id, citDean.id, 1);
    const citISHead = await member('Dr. Grace Hopper', 'Head of Information Systems', cit.id, citDean.id, 2);
    await member('Ada Lovelace', 'Software Engineering Instructor', cit.id, citCSHead.id, 1);
    await member('Tim Berners-Lee', 'Web Technologies Instructor', cit.id, citISHead.id, 1);
    const cbaDean = await member('Dr. Jose Rizal', 'Dean, College of Business', cba.id, null, 1);
    await member('Adam Smith', 'Economics Department Chair', cba.id, cbaDean.id, 1);

    // 7. Downloads: skipped (the Laravel seeder only wrote mock text files).

    // 8. Settings
    await db.setting.upsert({
        where: { key: 'welcome_hero_content' },
        create: { key: 'welcome_hero_content', value: WELCOME_HERO },
        update: { value: WELCOME_HERO },
    });

    // 9. Hero sections
    await db.heroSection.createMany({
        data: [
            {
                title: 'Welcome Introduction',
                content:
                    '# Welcome to San Isidro College\n\n<Center>\nEmpowering minds, cultivating values, and inspiring service since 1949.\n</Center>',
                order: 1,
                isActive: true,
                departmentId: null,
            },
            {
                title: 'Academic & Campus Life Blocks',
                content:
                    '<Flex>\n<Card title="Academic Programs">\nExplore our comprehensive collegiate courses and find the perfect path for your future career.\n</Card>\n<Card title="Campus Life">\nJoin student organizations, varsity sports, and artistic groups to build lifelong connections.\n</Card>\n</Flex>\n\n<Accordion title="Learn More About SIC">\nSan Isidro College is a Catholic diocesan educational institution located in Malaybalay City, Bukidnon, Philippines. We are committed to developing students with strong values, academic excellence, and a passion for community service.\n</Accordion>\n\n<Badges>Values, Excellence, Service, Innovation</Badges>',
                order: 2,
                isActive: true,
                departmentId: null,
            },
            {
                title: 'CIT Tech Spotlight',
                content:
                    '# Lead the Digital Frontier\n\n<Center>\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**.\n</Center>\n\n<Flex>\n<Card title="Modern Laboratories">\nEquipped with high-spec developer environments and active publication in AI.\n</Card>\n<Card title="Industry Integration">\nInternships with top-tier technology firms and coding hackathons.\n</Card>\n</Flex>',
                order: 1,
                isActive: true,
                departmentId: cit.id,
            },
            {
                title: 'CBA Commerce Highlight',
                content:
                    '# Shape the Future of Commerce\n\n<Center>\nDeveloping ethical business leaders, entrepreneurs, and financial managers.\n</Center>\n\n<Flex>\n<Card title="Business Incubator">\nPitch, prototype, and launch your own startup with mentor support.\n</Card>\n<Card title="Case-Study Method">\nLearn through real-world corporate challenges and strategic marketing.\n</Card>\n</Flex>',
                order: 1,
                isActive: true,
                departmentId: cba.id,
            },
        ],
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
