/**
 * Demo content shared by `prisma/seed.ts` and the e2e specs: the Users, Departments, Posts, Hero sections and
 * Members the specs look up by name. Rows refer to each other by key (`department: 'cit'`, `author: 'cit'`,
 * `parent: <member name>`); the seed resolves the keys to ids.
 */

/** Laravel stored these wall-clock times in the app timezone (Asia/Manila). */
const manila = (local: string) => new Date(`${local.replace(' ', 'T')}+08:00`);

/** Seeding writes demo Users with known Passwords: only a local database is accepted unless SEED_ALLOW_REMOTE=1. */
export function assertLocalDatabase(): void {
    const url = process.env.DATABASE_URL ?? '';
    if (process.env.SEED_ALLOW_REMOTE === '1' || url.startsWith('file:')) return;
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch {
        // Unparseable: treated as remote below.
    }
    if (['localhost', '127.0.0.1', '[::1]'].includes(host)) return;
    throw new Error(
        `Refusing to seed ${host ? `the database on ${host}` : 'a database that is not local'}. ` +
            'Set SEED_ALLOW_REMOTE=1 if that is really intended.',
    );
}

/** The Password of a seeded User: the env override, else `password` (never defaulted in production). */
export function seedPassword(envName: 'SEED_SUPERADMIN_PASSWORD' | 'SEED_DEPARTMENT_PASSWORD'): string {
    const value = process.env[envName];
    if (value) return value;
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${envName} must be set when seeding in production`);
    }
    return 'password';
}

export type DemoDepartmentKey = 'cit' | 'cba' | 'coe';

export const DEMO_DEPARTMENTS = {
    cit: {
        name: 'College of Information Technology',
        slug: 'cit',
        description:
            'Empowering the next generation of technology leaders through innovative curricula, hands-on programming labs, and industry-partnered software engineering projects.',
        heroContent:
            '# Lead the Digital Frontier\n\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**. Our graduates are globally competitive, highly technical, and values-driven professionals.\n\n### Why Choose CIT?\n- **Modern Laboratories:** Equipped with high-spec developer environments.\n- **Industry Integration:** Internships with top-tier technology firms.\n- **Research Focused:** Active publication in artificial intelligence and systems design.',
    },
    cba: {
        name: 'College of Business Administration',
        slug: 'cba',
        description:
            'Developing ethical business leaders, entrepreneurs, and financial managers who drive sustainable economic growth and societal progress.',
        heroContent:
            '# Shape the Future of Commerce\n\nAt the College of Business Administration, we foster entrepreneurship, strategic marketing, and ethical leadership. We prepare students for the complexities of global trade, digital finance, and corporate management.\n\n### Key Highlights\n- **Business Incubator:** Pitch, prototype, and launch your own startup.\n- **Case-Study Method:** Learn through real-world corporate challenges.\n- **Global Networking:** Mentorship programs with successful alumni business owners.',
    },
    coe: {
        name: 'College of Education',
        slug: 'coe',
        description:
            'Nurturing compassionate educators, curriculum developers, and academic leaders dedicated to transformative learning experiences.',
        heroContent:
            "# Inspire Through Transformative Education\n\nThe College of Education is the cornerstone of San Isidro College's academic legacy. We combine pedagogical theory with extensive classroom practice to shape teachers who inspire and lead.\n\n### Specializations Offered\n- **Elementary Education:** Child development and fundamental learning systems.\n- **Secondary Education:** Math, Science, English, and Social Studies majors.\n- **Special Needs Education:** Inclusive teaching and learning strategies.",
    },
} satisfies Record<DemoDepartmentKey, { name: string; slug: string; description: string; heroContent: string }>;

export interface DemoUser {
    name: string;
    email: string;
    role: 'superadmin' | 'department_user';
    department: DemoDepartmentKey | null;
}

export const DEMO_USERS = {
    superAdmin: {
        name: 'Dr. Maria Clara (Super Admin)',
        email: 'admin@sic.edu.ph',
        role: 'superadmin',
        department: null,
    },
    cit: {
        name: 'Prof. Juan Dela Cruz (CIT Admin)',
        email: 'cit@sic.edu.ph',
        role: 'department_user',
        department: 'cit',
    },
    cba: { name: 'Dr. Jose Rizal (CBA Admin)', email: 'cba@sic.edu.ph', role: 'department_user', department: 'cba' },
} satisfies Record<string, DemoUser>;
export type DemoUserKey = keyof typeof DEMO_USERS;

export const WELCOME_HERO = `# Welcome to San Isidro College

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

export interface DemoPost {
    title: string;
    content: string;
    type: 'announcement' | 'event' | 'article';
    startDate: Date | null;
    endDate: Date | null;
    department: DemoDepartmentKey | null;
    author: DemoUserKey;
    isFeatured: boolean;
}

/** The heading and the quote of the AI lab post's Markdown, which the e2e specs look for on the page and in the editor. */
export const AI_LAB_HEADING = 'Leading the Future of AI';
export const AI_LAB_QUOTE =
    'This laboratory provides our software engineering students with the computing power needed to solve real-world problems using machine learning.';

/** The sub-links of the seeded Downloads navigation link, in order. */
export const DEMO_DOWNLOAD_NAV_CHILDREN = ['Student Handbook', 'Academic Calendars'] as const;

export const DEMO_POSTS = {
    enrolment: {
        title: 'SIC Enrolment Guide for First Semester 2026-2027',
        content:
            "# Complete Enrolment Steps\n\nWelcome to San Isidro College! Follow this simple guide to complete your registration.\n\n### Step 1: Admissions Review\nSubmit your transcript, birth certificate, and high school diploma to the Registrar Office.\n\n### Step 2: Faculty Evaluation\nVisit your department dean's office for academic advising and course scheduling.\n\n### Step 3: Payment & Verification\nPay your tuition fee at the Cashier's Desk or online bank transfer, then check your portal.",
        type: 'announcement',
        startDate: null,
        endDate: null,
        department: null,
        author: 'superAdmin',
        isFeatured: true,
    },
    foundationWeek: {
        title: '74th Foundation Week Celebration',
        content:
            '# Celebrate with Pride!\n\nOur annual Foundation Week features sports events, music festivals, food trucks, and academic debates.\n\n### Schedule of Key Events\n- **August 15:** Grand Opening Parade (8:00 AM)\n- **August 17:** College Quiz Bee & IT Hackathon Exhibition\n- **August 19:** Alumni Dinner Dance & Gala Concert\n- **August 20:** Awarding Ceremony & Fireworks Display',
        type: 'event',
        startDate: manila('2026-08-15 08:00:00'),
        endDate: manila('2026-08-20 22:00:00'),
        department: null,
        author: 'superAdmin',
        isFeatured: true,
    },
    aiLab: {
        title: 'CIT Unveils New AI Research Laboratory',
        content: `# ${AI_LAB_HEADING}\n\nThe College of Information Technology is excited to announce the official opening of the AI Research Lab. Sponsored by local tech alumni, the lab houses top-tier GPUs to support student research in computer vision, large language models, and IoT automation.\n\nDean Del Cruz expressed his excitement:\n> "${AI_LAB_QUOTE}"`,
        type: 'article',
        startDate: null,
        endDate: null,
        department: 'cit',
        author: 'cit',
        isFeatured: false,
    },
    quantumSeminar: {
        title: 'CIT Tech Seminar: Quantum Computing Basics',
        content:
            '# Join the Seminar!\n\nLearn the fundamentals of quantum gates, superposition, and next-generation cryptography in this introductory seminar led by guest speakers from global technology firms.\n\n### Details\n- **Room:** CIT Lab 3\n- **Duration:** 3 Hours\n- **Prerequisites:** Basic understanding of algebra and Boolean logic.',
        type: 'event',
        startDate: manila('2026-07-20 13:00:00'),
        endDate: manila('2026-07-20 16:00:00'),
        department: 'cit',
        author: 'cit',
        isFeatured: false,
    },
    entrepreneurshipAward: {
        title: 'CBA Students Win National Entrepreneurship Award',
        content:
            '# Championing Innovation\n\nA team of three senior Business Administration students won first place at the National Business Innovation Pitch for their sustainable urban agriculture platform. The startup secures seed funding and office space inside the SIC Business Incubator.\n\n### Winning Team Members\n- **Juan Luna** (Finance)\n- **Ana Maria** (Marketing)\n- **Luis Miguel** (Operations)',
        type: 'article',
        startDate: null,
        endDate: null,
        department: 'cba',
        author: 'cba',
        isFeatured: false,
    },
} satisfies Record<string, DemoPost>;

export interface DemoHeroSection {
    title: string;
    content: string;
    order: number;
    isActive: boolean;
    department: DemoDepartmentKey | null;
}

export const DEMO_HERO_SECTIONS = {
    welcome: {
        title: 'Welcome Introduction',
        content:
            '# Welcome to San Isidro College\n\n<Center>\nEmpowering minds, cultivating values, and inspiring service since 1949.\n</Center>',
        order: 1,
        isActive: true,
        department: null,
    },
    campusLife: {
        title: 'Academic & Campus Life Blocks',
        content:
            '<Flex>\n<Card title="Academic Programs">\nExplore our comprehensive collegiate courses and find the perfect path for your future career.\n</Card>\n<Card title="Campus Life">\nJoin student organizations, varsity sports, and artistic groups to build lifelong connections.\n</Card>\n</Flex>\n\n<Accordion title="Learn More About SIC">\nSan Isidro College is a Catholic diocesan educational institution located in Malaybalay City, Bukidnon, Philippines. We are committed to developing students with strong values, academic excellence, and a passion for community service.\n</Accordion>\n\n<Badges>Values, Excellence, Service, Innovation</Badges>',
        order: 2,
        isActive: true,
        department: null,
    },
    cit: {
        title: 'CIT Tech Spotlight',
        content:
            '# Lead the Digital Frontier\n\n<Center>\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**.\n</Center>\n\n<Flex>\n<Card title="Modern Laboratories">\nEquipped with high-spec developer environments and active publication in AI.\n</Card>\n<Card title="Industry Integration">\nInternships with top-tier technology firms and coding hackathons.\n</Card>\n</Flex>',
        order: 1,
        isActive: true,
        department: 'cit',
    },
    cba: {
        title: 'CBA Commerce Highlight',
        content:
            '# Shape the Future of Commerce\n\n<Center>\nDeveloping ethical business leaders, entrepreneurs, and financial managers.\n</Center>\n\n<Flex>\n<Card title="Business Incubator">\nPitch, prototype, and launch your own startup with mentor support.\n</Card>\n<Card title="Case-Study Method">\nLearn through real-world corporate challenges and strategic marketing.\n</Card>\n</Flex>',
        order: 1,
        isActive: true,
        department: 'cba',
    },
} satisfies Record<string, DemoHeroSection>;

export interface DemoMember {
    name: string;
    role: string;
    department: DemoDepartmentKey;
    /** Key of another member of the same department, listed before this one. */
    parent: string | null;
    order: number;
}

export const DEMO_MEMBERS = {
    citDean: { name: 'Prof. Juan Dela Cruz', role: 'Dean, College of IT', department: 'cit', parent: null, order: 1 },
    citCsHead: {
        name: 'Dr. Alan Turing',
        role: 'Head of Computer Science',
        department: 'cit',
        parent: 'citDean',
        order: 1,
    },
    citIsHead: {
        name: 'Dr. Grace Hopper',
        role: 'Head of Information Systems',
        department: 'cit',
        parent: 'citDean',
        order: 2,
    },
    citInstructor: {
        name: 'Ada Lovelace',
        role: 'Software Engineering Instructor',
        department: 'cit',
        parent: 'citCsHead',
        order: 1,
    },
    citWebInstructor: {
        name: 'Tim Berners-Lee',
        role: 'Web Technologies Instructor',
        department: 'cit',
        parent: 'citIsHead',
        order: 1,
    },
    cbaDean: { name: 'Dr. Jose Rizal', role: 'Dean, College of Business', department: 'cba', parent: null, order: 1 },
    cbaChair: {
        name: 'Adam Smith',
        role: 'Economics Department Chair',
        department: 'cba',
        parent: 'cbaDean',
        order: 1,
    },
} satisfies Record<string, DemoMember>;
