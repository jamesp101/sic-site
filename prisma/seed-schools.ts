/**
 * Sample content for five schools: the department, 20 posts and an org chart of 7–15 members each.
 * Member portraits are DiceBear avatar URLs (external URLs pass through `publicUrl`).
 *
 *   tsx prisma/seed-schools.ts [--reset]
 *
 * Schools whose slug already exists are skipped; `--reset` deletes their posts and members and
 * recreates them. Posts are authored by the first superadmin, so run `prisma/seed.ts` or
 * `prisma/create-admin.ts` first.
 */
import { createDocument, serializeDocument } from '../src/lib/blocks/document';
import { markdownToBlocks } from '../src/lib/blocks/from-markdown';
import { db } from '../src/lib/server/db';

const reset = process.argv.includes('--reset');

type PostType = 'article' | 'event' | 'announcement';
type PostSeed = [type: PostType, title: string, summary: string];
interface MemberSeed {
    name: string;
    role: string;
    children?: MemberSeed[];
}
interface SchoolSeed {
    name: string;
    slug: string;
    short: string;
    description: string;
    heroContent: string;
    venue: string;
    posts: PostSeed[];
    members: MemberSeed;
}

const DAY = 24 * 60 * 60 * 1000;

function slugify(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Midnight today in Manila plus `days`, at `hour` local time. */
function manilaDay(days: number, hour: number): Date {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    return new Date(new Date(`${today}T${String(hour).padStart(2, '0')}:00:00+08:00`).getTime() + days * DAY);
}

function body(school: SchoolSeed, [type, , summary]: PostSeed): string {
    if (type === 'event') {
        return `${summary}\n\n## Event details\n\n- **Venue:** ${school.venue}\n- **Open to:** ${school.short} students, faculty and guests\n- **Registration:** at the ${school.short} Dean's Office or through your class adviser\n\nPlease arrive fifteen minutes early and bring your school ID.`;
    }
    if (type === 'announcement') {
        return `${summary}\n\n## Reminders\n\n- Read the full guidelines posted on the ${school.short} bulletin board.\n- Bring your school ID for all transactions.\n- Direct questions to the ${school.short} Dean's Office during office hours (8:00 AM–5:00 PM, Monday to Friday).`;
    }
    return `${summary}\n\n## Why it matters\n\nThe ${school.name} continues to connect classroom learning with real work and service to the community, in keeping with the San Isidro College tradition of values, excellence and service.\n\n> "Our students learn best when they apply what they know to the needs of the people around them." — ${school.members.name}, ${school.members.role}`;
}

const SCHOOLS: SchoolSeed[] = [
    {
        name: 'School of Information Technology',
        slug: 'sit',
        short: 'SIT',
        venue: 'SIT Building, Computer Laboratory 2',
        description:
            'Preparing software developers, network administrators and data specialists through hands-on laboratory work and industry partnerships.',
        heroContent:
            '# Build Technology That Serves\n\nThe School of Information Technology offers programs in **Information Technology** and **Computer Science**, with tracks in software development, networking and data analytics.\n\n### Highlights\n- **Modern laboratories** for programming, networking and multimedia.\n- **On-the-job training** with partner ICT firms.\n- **Capstone projects** that solve real problems for local organizations.',
        posts: [
            [
                'announcement',
                'Enrollment Open for BS Information Technology, AY 2026–2027',
                'Online pre-registration for incoming and continuing BSIT and BSCS students is now open until the end of the month.',
            ],
            [
                'article',
                'SIT Students Place Second at Regional Hackathon',
                'A team of four third-year students placed second out of 32 teams with a disaster-alert app built in 36 hours.',
            ],
            [
                'event',
                'Web Development Bootcamp: Building with Modern Frameworks',
                'A two-day bootcamp covering HTML, CSS, JavaScript and component-based frameworks, ending with a mini project showcase.',
            ],
            [
                'article',
                'New Networking Laboratory Opens with Enterprise Equipment',
                'The new laboratory gives students hands-on practice with routers, managed switches and structured cabling.',
            ],
            [
                'announcement',
                'Capstone Project Proposal Defense Schedule',
                'Proposal defenses for fourth-year capstone groups will run over two weeks; panel assignments are posted by section.',
            ],
            [
                'event',
                'Cybersecurity Awareness Week',
                'A week of talks and challenges on password hygiene, phishing and safe online practices for the whole campus.',
            ],
            [
                'article',
                'Alumni Spotlight: From SIC to Software Engineer',
                'A 2019 graduate shares how capstone work and internships led to a role at a software company in Cebu.',
            ],
            [
                'event',
                'Introduction to Data Analytics with Python',
                'A hands-on workshop on cleaning, exploring and visualizing data with Python notebooks.',
            ],
            [
                'announcement',
                'Laboratory Use Policy Updated for the Second Semester',
                'Laboratory reservations now go through the SIT office, and food and drinks remain prohibited in all computer rooms.',
            ],
            [
                'article',
                'Faculty Earn Cloud Practitioner Certifications',
                'Five faculty members completed cloud fundamentals certifications, strengthening the cloud computing elective.',
            ],
            [
                'event',
                'Mobile App Development Seminar',
                'Guest developers walk through designing, building and publishing a mobile application.',
            ],
            [
                'article',
                'Student-Built Library System Goes Live on Campus',
                'A capstone team’s book circulation system is now used by the college library for borrowing and returns.',
            ],
            [
                'announcement',
                'Call for Student Assistants in the Computer Laboratories',
                'The school is accepting applications for laboratory student assistants; qualified applicants receive a tuition discount.',
            ],
            [
                'event',
                'SIT Days 2026: Exhibits, Games and Tech Talks',
                'The annual SIT Days features project exhibits, programming contests, e-sports and talks from alumni.',
            ],
            [
                'article',
                'Partnership Signed with Local ICT Firms for OJT Placements',
                'New agreements with three local companies add on-the-job training slots for graduating students.',
            ],
            [
                'event',
                'UI/UX Design Fundamentals Workshop',
                'Students learn user research, wireframing and usability testing through short design exercises.',
            ],
            [
                'announcement',
                'Midterm Examination Schedule for IT Courses',
                'The midterm schedule for major subjects is final; laboratory exams will be held in assigned rooms.',
            ],
            [
                'article',
                'Research on IoT Crop Monitoring Accepted at Conference',
                'A faculty-student paper on low-cost soil sensors for Bukidnon farms was accepted at a national computing conference.',
            ],
            [
                'event',
                'Open Source Contribution Day',
                'Students pair up to make their first contributions to open-source projects with mentors on hand.',
            ],
            [
                'announcement',
                'Wi-Fi Access Extended to the SIT Building',
                'Campus Wi-Fi now covers all SIT classrooms and laboratories; log in with your student portal account.',
            ],
        ],
        members: {
            name: 'Dr. Ramon Villanueva',
            role: 'Dean, School of Information Technology',
            children: [
                {
                    name: 'Engr. Liza Santos',
                    role: 'Program Chair, BS Information Technology',
                    children: [
                        { name: 'Mark Anthony Reyes', role: 'Instructor, Web Development' },
                        { name: 'Joanna Cruz', role: 'Instructor, Networking' },
                        { name: 'Paolo Garcia', role: 'Instructor, Database Systems' },
                        { name: 'Kristine Bautista', role: 'Instructor, Multimedia' },
                    ],
                },
                {
                    name: 'Carlo Mendoza',
                    role: 'Program Chair, BS Computer Science',
                    children: [
                        { name: 'Dr. Elena Torres', role: 'Associate Professor, Algorithms' },
                        { name: 'Miguel Flores', role: 'Instructor, Software Engineering' },
                        { name: 'Angela Ramos', role: 'Instructor, Data Science' },
                    ],
                },
                { name: 'Jerome Castillo', role: 'Laboratory Custodian' },
                { name: 'Maricel Aquino', role: 'School Secretary' },
            ],
        },
    },
    {
        name: 'School of Engineering',
        slug: 'soe',
        short: 'SOE',
        venue: 'Engineering Building, Lecture Hall A',
        description:
            'Forming civil, electrical and mechanical engineers who design safe, sustainable infrastructure for Bukidnon and beyond.',
        heroContent:
            '# Engineer a Better Mindanao\n\nThe School of Engineering offers **Civil**, **Electrical** and **Mechanical Engineering**, combining strong fundamentals with design projects and fieldwork.\n\n### Highlights\n- **Materials and hydraulics laboratories** for hands-on testing.\n- **Licensure review** integrated into the final year.\n- **Community projects** in surveying, water systems and renewable energy.',
        posts: [
            [
                'announcement',
                'BS Civil Engineering Admissions Now Open',
                'Applications for first-year Civil, Electrical and Mechanical Engineering students are being accepted at the Admissions Office.',
            ],
            [
                'article',
                'Students Design Low-Cost Water Filtration System',
                'A fourth-year design team built a sand-and-charcoal filtration unit now piloted in a mountain barangay.',
            ],
            [
                'event',
                'Structural Design Competition 2026',
                'Teams design and load-test model trusses; the strongest structure per gram of material wins.',
            ],
            [
                'article',
                'Board Exam Passers Celebrated at Recognition Rites',
                'The school honored its newest licensed engineers and the faculty who prepared them.',
            ],
            [
                'announcement',
                'Laboratory Safety Orientation Is Mandatory for Freshmen',
                'All first-year students must attend the safety orientation before using any engineering laboratory.',
            ],
            [
                'event',
                'Seminar on Sustainable Infrastructure',
                'Practitioners discuss green building materials, drainage design and climate-resilient roads.',
            ],
            [
                'article',
                'New Materials Testing Equipment Arrives',
                'A universal testing machine and concrete compression tester now support coursework and research.',
            ],
            [
                'event',
                'Engineering Week: Bridge-Building Challenge',
                'Year levels compete to build the strongest popsicle-stick bridge during Engineering Week.',
            ],
            [
                'announcement',
                'Plant Visit Requirements for Fourth-Year Students',
                'Submit signed parent consent forms and medical clearance before the scheduled industrial plant visit.',
            ],
            [
                'article',
                'Faculty Present Research on Slope Stability in Bukidnon',
                'The study maps landslide-prone road cuts and recommends low-cost stabilization methods.',
            ],
            [
                'event',
                'AutoCAD and BIM Training Workshop',
                'A three-day workshop on drafting and building information modeling for third- and fourth-year students.',
            ],
            [
                'article',
                'Students Volunteer in Barangay Road Survey Project',
                'Civil engineering students surveyed farm-to-market roads to help the province plan repairs.',
            ],
            [
                'announcement',
                'Review Classes for the Licensure Examination',
                'Graduating students may enroll in the in-house review program; classes start after final examinations.',
            ],
            [
                'event',
                'Electrical Safety and Wiring Standards Seminar',
                'A licensed master electrician explains the electrical code and safe residential wiring practice.',
            ],
            [
                'article',
                'Alumni Engineers Return to Mentor Graduating Students',
                'Twelve alumni from construction, power and manufacturing firms joined a mentoring day.',
            ],
            [
                'event',
                'Robotics Exhibition and Demo Day',
                'Student teams demonstrate line-following robots, robotic arms and automated sorting systems.',
            ],
            [
                'announcement',
                'Updated Thesis Formatting Guidelines',
                'The revised thesis manual takes effect this semester; advisers will check compliance at the final defense.',
            ],
            [
                'article',
                'Solar-Powered Charging Station Built by Student Team',
                'Electrical engineering students installed a solar charging kiosk near the campus library.',
            ],
            [
                'event',
                'Career Fair for Engineering Graduates',
                'Construction, energy and manufacturing companies interview graduating students on campus.',
            ],
            [
                'announcement',
                'Drafting Room Schedule for the Semester',
                'The drafting room is open to students on weekdays from 7:30 AM to 6:00 PM, except during scheduled classes.',
            ],
        ],
        members: {
            name: 'Engr. Antonio Ramos',
            role: 'Dean, School of Engineering',
            children: [
                {
                    name: 'Engr. Victoria Lim',
                    role: 'Program Chair, Civil Engineering',
                    children: [
                        { name: 'Engr. Daniel Ocampo', role: 'Instructor, Structural Engineering' },
                        { name: 'Engr. Rachelle Dizon', role: 'Instructor, Hydraulics' },
                        { name: 'Engr. Nestor Pascual', role: 'Instructor, Surveying' },
                    ],
                },
                {
                    name: 'Engr. Francis Velasco',
                    role: 'Program Chair, Electrical Engineering',
                    children: [
                        { name: 'Engr. Patricia Salazar', role: 'Instructor, Power Systems' },
                        { name: 'Engr. Joel Manalo', role: 'Instructor, Electronics' },
                        { name: 'Engr. Bea Soriano', role: 'Instructor, Control Systems' },
                    ],
                },
                {
                    name: 'Engr. Rodel Fernandez',
                    role: 'Program Chair, Mechanical Engineering',
                    children: [
                        { name: 'Engr. Ian Gutierrez', role: 'Instructor, Thermodynamics' },
                        { name: 'Engr. Camille Rivera', role: 'Instructor, Machine Design' },
                    ],
                },
                { name: 'Lorna Galang', role: 'School Secretary' },
                { name: 'Arnel Tolentino', role: 'Laboratory Technician, Materials' },
                { name: 'Ricky Mercado', role: 'Laboratory Technician, Electrical' },
            ],
        },
    },
    {
        name: 'School of Business Administration',
        slug: 'sba',
        short: 'SBA',
        venue: 'SBA Building, Audio-Visual Room',
        description:
            'Developing ethical managers and entrepreneurs in marketing, financial management and human resource management.',
        heroContent:
            '# Lead with Integrity\n\nThe School of Business Administration offers majors in **Marketing Management**, **Financial Management** and **Human Resource Management**.\n\n### Highlights\n- **Business incubator** for student startups.\n- **Immersion** with cooperatives and local enterprises.\n- **Case-based teaching** grounded in Mindanao business realities.',
        posts: [
            [
                'announcement',
                'BSBA Enrollment: Marketing, Financial and HR Management Majors',
                'Enrollment for all three BSBA majors is open; advising is available at the SBA office.',
            ],
            [
                'article',
                'Student Startup Wins Provincial Business Plan Competition',
                'A team selling dried-fruit snacks from local farms won first place and seed funding.',
            ],
            [
                'event',
                'Entrepreneurship Summit 2026',
                'Founders, investors and cooperative leaders share lessons on starting and growing businesses in Mindanao.',
            ],
            [
                'article',
                'Marketing Students Launch Campaign for Local Coffee Farmers',
                'Students created branding and social media content for a Bukidnon coffee growers’ association.',
            ],
            [
                'announcement',
                'Practicum Requirements for Graduating Students',
                'Submit your practicum agreement, endorsement letter and insurance before deployment.',
            ],
            [
                'event',
                'Financial Literacy Seminar for Young Professionals',
                'Learn budgeting, saving, insurance and investing basics before your first job.',
            ],
            [
                'article',
                'Alumni Feature: Building a Family Business in Malaybalay',
                'A graduate explains how she modernized her family’s hardware store with inventory software.',
            ],
            [
                'event',
                'Business Week Trade Fair',
                'Student-run booths sell food, crafts and services during the annual Business Week.',
            ],
            [
                'announcement',
                'Case Competition Team Tryouts',
                'Students interested in representing SBA at the regional case competition may sign up for tryouts.',
            ],
            [
                'article',
                'Faculty Complete Training on Digital Marketing Analytics',
                'Faculty finished a certificate course on web analytics and social media measurement.',
            ],
            [
                'event',
                'Leadership and Management Forum',
                'Executives from banking and retail discuss leading teams through change.',
            ],
            [
                'article',
                'Partnership with Local Cooperatives for Student Immersion',
                'Four cooperatives will host BSBA students for immersion in operations and member services.',
            ],
            [
                'announcement',
                'Schedule of Comprehensive Examinations',
                'Comprehensive examinations for graduating students will be held over two Saturdays.',
            ],
            [
                'event',
                'Workshop: Writing a Winning Business Plan',
                'A hands-on workshop on market analysis, financial projections and pitching.',
            ],
            [
                'article',
                'Students Assist Micro-Enterprises with Bookkeeping Setup',
                'Volunteers helped sari-sari store owners set up simple sales and expense records.',
            ],
            [
                'event',
                'Human Resource Management Conference',
                'HR practitioners discuss recruitment, labor law updates and employee wellbeing.',
            ],
            [
                'announcement',
                'Scholarship Applications for Business Students',
                'Partner companies are offering scholarships to qualified BSBA students; applications close at month end.',
            ],
            [
                'article',
                'Research on Consumer Behavior in Bukidnon Published',
                'A faculty study on how households choose between public markets and supermarkets was published.',
            ],
            [
                'event',
                'Mock Job Interview Day',
                'HR officers from partner companies conduct practice interviews and give feedback.',
            ],
            [
                'announcement',
                'Business Incubator Accepting New Student Teams',
                'Student teams with a validated idea may apply for space and mentoring in the business incubator.',
            ],
        ],
        members: {
            name: 'Dr. Teresa Navarro',
            role: 'Dean, School of Business Administration',
            children: [
                {
                    name: 'Gilbert Santiago',
                    role: 'Program Chair, Marketing Management',
                    children: [
                        { name: 'Hazel Valdez', role: 'Instructor, Consumer Behavior' },
                        { name: 'Jayson Robles', role: 'Instructor, Digital Marketing' },
                    ],
                },
                {
                    name: 'Dr. Annabelle Cortez',
                    role: 'Program Chair, Financial Management',
                    children: [{ name: 'Ronaldo Medina', role: 'Instructor, Corporate Finance' }],
                },
                {
                    name: 'Cristina Padilla',
                    role: 'Program Chair, Human Resource Management',
                    children: [{ name: 'Edwin Sarmiento', role: 'Instructor, Labor Relations' }],
                },
                { name: 'Jocelyn Abad', role: 'School Secretary' },
            ],
        },
    },
    {
        name: 'School of Nursing',
        slug: 'son',
        short: 'SON',
        venue: 'Nursing Building, Skills Laboratory',
        description:
            'Forming compassionate, competent nurses through rigorous clinical training and service to rural communities.',
        heroContent:
            '# Care with Competence and Compassion\n\nThe School of Nursing prepares students for professional practice through classroom instruction, skills laboratory training and supervised hospital and community duty.\n\n### Highlights\n- **Skills laboratory** with patient simulators.\n- **Affiliated hospitals** for clinical rotations.\n- **Community health** programs in partner barangays.',
        posts: [
            [
                'announcement',
                'BS Nursing Admissions and Entrance Exam Schedule',
                'Applicants must take the nursing entrance exam; schedules and requirements are available at the Admissions Office.',
            ],
            [
                'article',
                'Nursing Students Lead Community Health Outreach',
                'Students screened blood pressure and blood sugar for more than 300 residents in a partner barangay.',
            ],
            [
                'event',
                'Capping, Pinning and Candle Lighting Ceremony',
                'Second-year students formally begin their clinical training in a ceremony with their families.',
            ],
            [
                'article',
                'Skills Laboratory Upgraded with New Patient Simulators',
                'New adult and infant simulators let students practice assessment and emergency response safely.',
            ],
            [
                'announcement',
                'Clinical Duty Rotation Schedule Released',
                'Rotation assignments for all year levels are posted; report to your clinical instructor before your first shift.',
            ],
            [
                'event',
                'Basic Life Support Training',
                'Certified instructors teach adult and infant CPR and use of an automated external defibrillator.',
            ],
            [
                'article',
                'Licensure Exam Passers Honored by the School',
                'The school recognized its newest registered nurses and their clinical instructors.',
            ],
            [
                'event',
                'Seminar on Maternal and Child Health',
                'Midwives and public health nurses discuss prenatal care, breastfeeding and immunization.',
            ],
            [
                'announcement',
                'Updated Uniform and Grooming Policy for Clinical Areas',
                'The revised policy applies to all hospital and community duty starting this semester.',
            ],
            [
                'article',
                'Students Join Provincial Vaccination Drive',
                'Senior students assisted provincial health workers during a week-long immunization campaign.',
            ],
            [
                'event',
                'Mental Health Awareness Forum',
                'Counselors and nurses talk about stress, burnout and where students can find support.',
            ],
            [
                'article',
                'Faculty Present Research on Rural Health Access',
                'The study examines travel time and cost as barriers to clinic visits in upland communities.',
            ],
            [
                'announcement',
                'Health Requirements for Hospital Affiliation',
                'Submit updated vaccination records and medical clearance before clinical deployment.',
            ],
            [
                'event',
                'Nursing Week Celebration',
                'A week of quiz bees, skills competitions and a thanksgiving Mass for nursing students and faculty.',
            ],
            [
                'article',
                'Partner Hospital Agreements Renewed for Clinical Training',
                'Renewed agreements secure clinical slots in medical, surgical, pediatric and maternity wards.',
            ],
            [
                'event',
                'Workshop on Evidence-Based Nursing Practice',
                'Students learn to find, appraise and apply research in patient care plans.',
            ],
            [
                'announcement',
                'Board Exam Review Program Enrollment',
                'Graduating students may enroll in the school’s licensure review program.',
            ],
            [
                'article',
                'Alumna Shares Experience Working Abroad',
                'A 2016 graduate talks about licensure abroad, adjusting to a new hospital and staying connected to home.',
            ],
            [
                'event',
                'First Aid and Disaster Preparedness Drill',
                'A campus-wide drill on earthquake response, triage and first aid.',
            ],
            [
                'announcement',
                'Return Demonstration Schedule for Level I Students',
                'Return demonstrations for vital signs and bed-making will be held in the skills laboratory.',
            ],
        ],
        members: {
            name: 'Dr. Rosario Domingo, RN',
            role: 'Dean, School of Nursing',
            children: [
                {
                    name: 'Melanie Javier, RN',
                    role: 'Clinical Instruction Coordinator',
                    children: [
                        { name: 'Arvin Lopez, RN', role: 'Clinical Instructor, Medical-Surgical' },
                        { name: 'Grace Del Rosario, RN', role: 'Clinical Instructor, Maternal and Child' },
                        { name: 'Noel Espiritu, RN', role: 'Clinical Instructor, Community Health' },
                        { name: 'Sheila Marquez, RN', role: 'Clinical Instructor, Psychiatric Nursing' },
                    ],
                },
                {
                    name: 'Jennifer Ong, RN',
                    role: 'Skills Laboratory Coordinator',
                    children: [
                        { name: 'Ramil Cabrera, RN', role: 'Skills Laboratory Instructor' },
                        { name: 'Diana Herrera, RN', role: 'Skills Laboratory Instructor' },
                    ],
                },
                { name: 'Dr. Leonora Vergara, RN', role: 'Research Coordinator' },
                { name: 'Imelda Santos', role: 'School Secretary' },
            ],
        },
    },
    {
        name: 'School of Accounting',
        slug: 'soa',
        short: 'SOA',
        venue: 'SOA Building, Room 201',
        description:
            'Preparing accountants for public practice, industry and government with a strong foundation in ethics and the standards.',
        heroContent:
            '# Account for the Future\n\nThe School of Accounting offers **BS Accountancy**, preparing students for the CPA licensure examination and careers in audit, tax, industry and government.\n\n### Highlights\n- **Integrated CPA review** in the final year.\n- **Internships** with accounting firms and government agencies.\n- **Ethics** taught across the curriculum.',
        posts: [
            [
                'announcement',
                'BS Accountancy Enrollment and Retention Policy',
                'Enrollment is open; continuing students must meet the retention grade in major subjects.',
            ],
            [
                'article',
                'Accountancy Students Top Regional Quiz Bee',
                'A team of three students won first place in financial accounting and auditing rounds.',
            ],
            [
                'event',
                'Tax Season Seminar: Filing for Individuals and Small Businesses',
                'Practitioners explain income tax filing, deadlines and common mistakes.',
            ],
            [
                'article',
                'CPA Board Passers Recognized',
                'The school recognized its newest certified public accountants and their reviewers.',
            ],
            [
                'announcement',
                'Qualifying Examination Schedule for Second-Year Students',
                'Second-year students take the qualifying examination before advancing to major courses.',
            ],
            [
                'event',
                'Accounting Software Training',
                'Hands-on training on recording transactions and generating reports in accounting software.',
            ],
            [
                'article',
                'Students Volunteer in Free Tax Assistance Program',
                'Supervised students helped residents and small vendors complete their tax forms.',
            ],
            [
                'event',
                'Auditing Standards Update Forum',
                'Audit partners discuss recent changes to auditing standards and their effect on practice.',
            ],
            [
                'announcement',
                'CPA Review Program Opens Registration',
                'Graduates and graduating students may register for the in-house CPA review program.',
            ],
            [
                'article',
                'Faculty Earn Advanced Certifications in Forensic Accounting',
                'Two faculty members completed certifications in fraud examination and forensic accounting.',
            ],
            [
                'event',
                'Accountancy Week: Quiz Bee and Career Talks',
                'A week of quiz bees, career talks from alumni and a recognition night.',
            ],
            [
                'article',
                'Partnership with Accounting Firms for Internships',
                'Three accounting firms will host fourth-year students for audit and tax internships.',
            ],
            [
                'announcement',
                'Reminder on Academic Integrity During Examinations',
                'Unauthorized materials and devices are not allowed; violations follow the student handbook.',
            ],
            [
                'event',
                'Workshop on Financial Statement Analysis',
                'Students practice ratio analysis and interpreting financial statements of listed companies.',
            ],
            [
                'article',
                'Alumni Feature: Leading a Government Audit Team',
                'A graduate describes auditing local government units and what employers look for in new CPAs.',
            ],
            ['event', 'Mock Board Examination', 'A full-day simulated CPA board examination for graduating students.'],
            [
                'announcement',
                'Consultation Hours for Accounting Faculty',
                'Faculty consultation hours for the semester are posted outside the SOA office.',
            ],
            [
                'article',
                'Research on Cooperative Financial Reporting Published',
                'The study reviews reporting practices of agricultural cooperatives in Bukidnon.',
            ],
            [
                'event',
                'Ethics in Accounting Seminar',
                'A seminar on independence, confidentiality and professional judgment.',
            ],
            [
                'announcement',
                'Submission of Practicum Portfolios',
                'Submit your practicum portfolio with supervisor evaluations to your adviser before the deadline.',
            ],
        ],
        members: {
            name: 'Dr. Manuel Aquino, CPA',
            role: 'Dean, School of Accounting',
            children: [
                {
                    name: 'Rebecca Tan, CPA',
                    role: 'Program Chair, BS Accountancy',
                    children: [
                        { name: 'Dennis Morales, CPA', role: 'Instructor, Financial Accounting' },
                        { name: 'Michelle Yap, CPA', role: 'Instructor, Auditing' },
                        { name: 'Allan Briones, CPA', role: 'Instructor, Taxation' },
                    ],
                },
                { name: 'Florence Ignacio, CPA', role: 'CPA Review Coordinator' },
                { name: 'Rowena Castro', role: 'School Secretary' },
            ],
        },
    },
];

function countMembers(member: MemberSeed): number {
    return 1 + (member.children ?? []).reduce((sum, child) => sum + countMembers(child), 0);
}

async function createMembers(member: MemberSeed, departmentId: number, parentId: number | null, order: number) {
    const row = await db.member.create({
        data: {
            name: member.name,
            role: member.role,
            departmentId,
            parentId,
            order,
            imagePath: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(member.name)}`,
        },
    });
    for (const [index, child] of (member.children ?? []).entries()) {
        await createMembers(child, departmentId, row.id, index + 1);
    }
}

async function main() {
    const author = await db.user.findFirst({ where: { role: 'superadmin' }, orderBy: { id: 'asc' } });
    if (!author) throw new Error('No superadmin user found; run `vp run db:seed` or `vp run db:create-admin` first.');

    for (const [schoolIndex, school] of SCHOOLS.entries()) {
        const total = countMembers(school.members);
        if (school.posts.length !== 20 || total < 5 || total > 15) {
            throw new Error(
                `${school.name}: expected 20 posts and 5–15 members, got ${school.posts.length} and ${total}`,
            );
        }

        const existing = await db.department.findUnique({ where: { slug: school.slug } });
        if (existing && !reset) {
            console.log(
                `${school.name}: slug "${school.slug}" exists; skipped (use --reset to recreate its posts and members).`,
            );
            continue;
        }

        const fields = { name: school.name, description: school.description, heroContent: school.heroContent };
        const department = existing
            ? await db.department.update({ where: { id: existing.id }, data: fields })
            : await db.department.create({ data: { ...fields, slug: school.slug } });
        if (existing) {
            await db.post.deleteMany({ where: { departmentId: department.id } });
            await db.member.updateMany({ where: { departmentId: department.id }, data: { parentId: null } });
            await db.member.deleteMany({ where: { departmentId: department.id } });
        }

        let eventIndex = 0;
        for (const [index, post] of school.posts.entries()) {
            const [type, title] = post;
            const createdAt = new Date(Date.now() - (index * 6 + schoolIndex) * DAY);
            // Events alternate between recent past and upcoming dates so both listings have entries.
            const startDate = type === 'event' ? manilaDay((eventIndex % 2 === 0 ? 7 : -14) + eventIndex * 5, 9) : null;
            if (type === 'event') eventIndex++;
            await db.post.create({
                data: {
                    title,
                    slug: `${school.slug}-${slugify(title)}`,
                    content: serializeDocument(createDocument(markdownToBlocks(body(school, post)))),
                    type,
                    startDate,
                    endDate: startDate ? new Date(startDate.getTime() + 4 * 60 * 60 * 1000) : null,
                    departmentId: department.id,
                    userId: author.id,
                    isFeatured: index === 0,
                    createdAt,
                    updatedAt: createdAt,
                },
            });
        }

        await createMembers(school.members, department.id, null, 1);
        console.log(`${school.name}: ${school.posts.length} posts, ${total} members.`);
    }
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
