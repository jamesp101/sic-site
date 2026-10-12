import { describe, expect, it } from 'vite-plus/test';
import { createDocument, flatten, subtreeDepth } from './document';
import { markdownToBlocks } from './from-markdown';
import { inlineToText } from './inline';
import { renderBlocks } from './render';
import { validateDocument } from './schema';
import { LIMITS, type Block } from './types';

const textOf = (block: Block) => (block.type === 'paragraph' ? block.props.text : '');
const itemsOf = (block: Block) => (block.type === 'list' || block.type === 'badges' ? block.props.items : []);
const orderedOf = (block: Block) => (block.type === 'list' ? block.props.ordered : undefined);

const types = (blocks: Block[]) => blocks.map((block) => block.type);
const isValid = (blocks: Block[]) => validateDocument(createDocument(blocks)).ok;

/** Strings taken from `prisma/seed.ts` (hero sections and posts). */
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

const SEED_STRINGS = [
    WELCOME_HERO,
    '# Welcome to San Isidro College\n\n<Center>\nEmpowering minds, cultivating values, and inspiring service since 1949.\n</Center>',
    '<Flex>\n<Card title="Academic Programs">\nExplore our comprehensive collegiate courses and find the perfect path for your future career.\n</Card>\n<Card title="Campus Life">\nJoin student organizations, varsity sports, and artistic groups to build lifelong connections.\n</Card>\n</Flex>\n\n<Accordion title="Learn More About SIC">\nSan Isidro College is a Catholic diocesan educational institution.\n</Accordion>\n\n<Badges>Values, Excellence, Service, Innovation</Badges>',
    '# Lead the Digital Frontier\n\n<Center>\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**.\n</Center>\n\n<Flex>\n<Card title="Modern Laboratories">\nEquipped with high-spec developer environments and active publication in AI.\n</Card>\n<Card title="Industry Integration">\nInternships with top-tier technology firms and coding hackathons.\n</Card>\n</Flex>',
    '# Lead the Digital Frontier\n\nThe College of Information Technology at San Isidro College offers state-of-the-art specialization in **Software Engineering**, **Network Administration**, and **Data Analytics**. Our graduates are globally competitive, highly technical, and values-driven professionals.\n\n### Why Choose CIT?\n- **Modern Laboratories:** Equipped with high-spec developer environments.\n- **Industry Integration:** Internships with top-tier technology firms.\n- **Research Focused:** Active publication in artificial intelligence and systems design.',
    '# Shape the Future of Commerce\n\nAt the College of Business Administration, we foster entrepreneurship, strategic marketing, and ethical leadership. We prepare students for the complexities of global trade, digital finance, and corporate management.\n\n### Key Highlights\n- **Business Incubator:** Pitch, prototype, and launch your own startup.\n- **Case-Study Method:** Learn through real-world corporate challenges.\n- **Global Networking:** Mentorship programs with successful alumni business owners.',
    "# Inspire Through Transformative Education\n\nThe College of Education is the cornerstone of San Isidro College's academic legacy. We combine pedagogical theory with extensive classroom practice to shape teachers who inspire and lead.\n\n### Specializations Offered\n- **Elementary Education:** Child development and fundamental learning systems.\n- **Secondary Education:** Math, Science, English, and Social Studies majors.\n- **Special Needs Education:** Inclusive teaching and learning strategies.",
    "# Complete Enrolment Steps\n\nWelcome to San Isidro College! Follow this simple guide to complete your registration.\n\n### Step 1: Admissions Review\nSubmit your transcript, birth certificate, and high school diploma to the Registrar Office.\n\n### Step 2: Faculty Evaluation\nVisit your department dean's office for academic advising and course scheduling.\n\n### Step 3: Payment & Verification\nPay your tuition fee at the Cashier's Desk or online bank transfer, then check your portal.",
    '# Celebrate with Pride!\n\nOur annual Foundation Week features sports events, music festivals, food trucks, and academic debates.\n\n### Schedule of Key Events\n- **August 15:** Grand Opening Parade (8:00 AM)\n- **August 17:** College Quiz Bee & IT Hackathon Exhibition\n- **August 19:** Alumni Dinner Dance & Gala Concert\n- **August 20:** Awarding Ceremony & Fireworks Display',
    '# Leading the Future of AI\n\nThe College of Information Technology is excited to announce the official opening of the AI Research Lab. Sponsored by local tech alumni, the lab houses top-tier GPUs.\n\nDean Del Cruz expressed his excitement:\n> "This laboratory provides our software engineering students with the computing power needed to solve real-world problems using machine learning."',
    '# Join the Seminar!\n\nLearn the fundamentals of quantum gates.\n\n### Details\n- **Room:** CIT Lab 3\n- **Duration:** 3 Hours\n- **Prerequisites:** Basic understanding of algebra and Boolean logic.',
    '# Championing Innovation\n\nA team of three senior Business Administration students won first place.\n\n### Winning Team Members\n- **Juan Luna** (Finance)\n- **Ana Maria** (Marketing)\n- **Luis Miguel** (Operations)',
];

describe('markdownToBlocks: basics', () => {
    it('returns no blocks for empty input', () => {
        expect(markdownToBlocks('')).toEqual([]);
        expect(markdownToBlocks('  \n\t\n ')).toEqual([]);
        expect(markdownToBlocks("import Foo from './foo';")).toEqual([]);
    });

    it('drops import lines', () => {
        const blocks = markdownToBlocks("import Foo from './foo';\n\nText");
        expect(types(blocks)).toEqual(['paragraph']);
        expect(blocks[0].props).toMatchObject({ text: 'Text' });
    });

    it('gives every block a unique id and handles CRLF', () => {
        const blocks = markdownToBlocks('a\r\n\r\nb\r\n\r\n# c');
        expect(types(blocks)).toEqual(['paragraph', 'paragraph', 'heading']);
        const ids = flatten(blocks).map((entry) => entry.block.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(markdownToBlocks('a')[0].id).not.toBe(markdownToBlocks('a')[0].id);
    });
});

describe('markdownToBlocks: headings', () => {
    it('maps # to level 2, ## to 3 and deeper to 4', () => {
        const blocks = markdownToBlocks('# A\n## B\n### C\n#### D\n##### E\n###### F');
        expect(types(blocks)).toEqual(Array(6).fill('heading'));
        expect(blocks.map((block) => block.props)).toMatchObject([
            { text: 'A', level: 2 },
            { text: 'B', level: 3 },
            { text: 'C', level: 4 },
            { text: 'D', level: 4 },
            { text: 'E', level: 4 },
            { text: 'F', level: 4 },
        ]);
    });

    it('strips inline markup from heading text', () => {
        const [heading] = markdownToBlocks('# A **bold** *it* and `code` [link](/x)');
        expect(heading.props).toMatchObject({ text: 'A bold it and code link', level: 2 });
    });

    it('never produces empty headings', () => {
        expect(markdownToBlocks('# ')).toEqual([]);
        expect(markdownToBlocks('#   \n\ntext').map((block) => block.type)).toEqual(['paragraph']);
    });

    it('keeps a heading that is too long for a heading block verbatim', () => {
        const line = `# ${'x'.repeat(LIMITS.label + 1)}`;
        const blocks = markdownToBlocks(line);
        expect(blocks).toHaveLength(1);
        expect(blocks[0].type).toBe('markdown');
        expect(blocks[0].props).toMatchObject({ source: line });
        expect(isValid(blocks)).toBe(true);
    });

    it('ends a paragraph at a heading line', () => {
        expect(types(markdownToBlocks('Intro\n### Step\nText'))).toEqual(['paragraph', 'heading', 'paragraph']);
    });
});

describe('markdownToBlocks: paragraphs', () => {
    it('splits on blank lines and keeps single newlines', () => {
        const blocks = markdownToBlocks('One\ntwo\n\nThree');
        expect(blocks.map((block) => block.props)).toMatchObject([{ text: 'One\ntwo' }, { text: 'Three' }]);
    });

    it('keeps bold, italic and links as inline markup', () => {
        const [paragraph] = markdownToBlocks('a **b** *c* [d](https://x.example)');
        expect(paragraph.props).toMatchObject({ text: 'a **b** *c* [d](https://x.example)' });
    });

    it('drops backticks and keeps code content literal', () => {
        const [paragraph] = markdownToBlocks('Use `a*b*` and `x` here');
        expect(paragraph.props).toMatchObject({ text: 'Use a\\*b\\* and x here' });
        expect(inlineToText('Use a\\*b\\* and x here')).toBe('Use a*b* and x here');
    });

    it('keeps literal backslashes', () => {
        const [paragraph] = markdownToBlocks('path C:\\temp\\new');
        const text = textOf(paragraph);
        expect(inlineToText(text)).toBe('path C:\\temp\\new');
    });

    it('splits paragraphs that exceed the text limit without losing words', () => {
        const source = 'word '.repeat(1200).trim();
        const blocks = markdownToBlocks(source);
        expect(blocks.length).toBeGreaterThan(1);
        const texts = blocks.map(textOf);
        for (const text of texts) expect(text.length).toBeLessThanOrEqual(LIMITS.text);
        expect(texts.join(' ')).toBe(source);
        expect(isValid(blocks)).toBe(true);
    });

    it('does not treat bold text at the start of a line as a list', () => {
        expect(types(markdownToBlocks('**Bold** start'))).toEqual(['paragraph']);
    });
});

describe('markdownToBlocks: lists and quotes', () => {
    it('maps -, * and + items to one unordered list', () => {
        const blocks = markdownToBlocks('- a\n* b\n+ c');
        expect(types(blocks)).toEqual(['list']);
        expect(blocks[0].props).toEqual({ ordered: false, items: ['a', 'b', 'c'] });
    });

    it('maps numbered items to an ordered list', () => {
        const blocks = markdownToBlocks('1. first\n2. second\n3) third');
        expect(blocks[0].props).toEqual({ ordered: true, items: ['first', 'second', 'third'] });
    });

    it('keeps separate lists apart', () => {
        const blocks = markdownToBlocks('- a\n\n1. b\n\ntext\n\n- c\n1. d');
        expect(types(blocks)).toEqual(['list', 'list', 'paragraph', 'list', 'list']);
        expect(blocks.map(orderedOf)).toEqual([false, true, undefined, false, true]);
    });

    it('keeps inline markup in items', () => {
        const [list] = markdownToBlocks('- **Room:** CIT Lab 3\n- `code` item');
        expect(list.props).toMatchObject({ items: ['**Room:** CIT Lab 3', 'code item'] });
    });

    it('splits very long lists', () => {
        const source = Array.from({ length: LIMITS.listItems + 10 }, (_, index) => `- item ${index}`).join('\n');
        const blocks = markdownToBlocks(source);
        expect(types(blocks)).toEqual(['list', 'list']);
        expect(itemsOf(blocks[0])).toHaveLength(LIMITS.listItems);
        expect(itemsOf(blocks[1])).toHaveLength(10);
        expect(isValid(blocks)).toBe(true);
    });

    it('keeps a list with an oversized item verbatim', () => {
        const source = `- short\n- ${'x'.repeat(LIMITS.label + 1)}`;
        const blocks = markdownToBlocks(source);
        expect(types(blocks)).toEqual(['markdown']);
        expect(blocks[0].props).toMatchObject({ source });
        expect(isValid(blocks)).toBe(true);
    });

    it('maps quotes and joins consecutive quote lines', () => {
        const blocks = markdownToBlocks('Intro:\n> one\n> *two*\n\nAfter');
        expect(types(blocks)).toEqual(['paragraph', 'quote', 'paragraph']);
        expect(blocks[1].props).toMatchObject({ text: 'one\n*two*', cite: '' });
    });
});

describe('markdownToBlocks: images and code', () => {
    it('converts an image on its own line to an image block', () => {
        const blocks = markdownToBlocks('Text\n![A tree](/storage/a.png)\nMore');
        expect(types(blocks)).toEqual(['paragraph', 'image', 'paragraph']);
        expect(blocks[1].props).toMatchObject({ src: '/storage/a.png', alt: 'A tree', decorative: false });
        expect(isValid(blocks)).toBe(true);
    });

    it('marks images without alt text as decorative', () => {
        const [image] = markdownToBlocks('![](https://cdn.example.com/a.png)');
        expect(image.props).toMatchObject({ src: 'https://cdn.example.com/a.png', alt: '', decorative: true });
        expect(isValid([image])).toBe(true);
    });

    it('keeps images with unsafe sources as plain paragraph text', () => {
        for (const src of [
            'data:image/png;base64,AAAA',
            '//evil.com/a.png',
            'mailto:a@example.com',
            'javascript:alert(1)',
        ]) {
            const blocks = markdownToBlocks(`![x](${src})`);
            expect(types(blocks), src).toEqual(['paragraph']);
            const html = renderBlocks(blocks);
            expect(html).not.toContain('<img');
            expect(html).not.toContain('javascript:');
        }
    });

    it('keeps fenced code verbatim in a markdown block', () => {
        const fence = '```ts\nconst a = 1;\n```';
        const blocks = markdownToBlocks(`Before\n\n${fence}\n\nAfter`);
        expect(types(blocks)).toEqual(['paragraph', 'markdown', 'paragraph']);
        expect(blocks[1].props).toEqual({ source: fence });
        expect(isValid(blocks)).toBe(true);
    });

    it('renders fenced code escaped', () => {
        const html = renderBlocks(markdownToBlocks('```\n<script>alert(1)</script>\n```'));
        expect(html).not.toContain('<script');
        expect(html).toContain('&lt;script&gt;');
    });
});

describe('markdownToBlocks: tags', () => {
    it('maps <Card title> to a card with the paragraphs as body', () => {
        const [card] = markdownToBlocks('<Card title="Academic Programs">\nBody one\n\nBody **two**\n</Card>');
        expect(card.type).toBe('card');
        expect(card.props).toMatchObject({ title: 'Academic Programs', body: 'Body one\n\nBody **two**' });
        expect(card.children).toEqual([]);
    });

    it('moves non-paragraph card content into children', () => {
        const [card] = markdownToBlocks('<Card title="T">\nIntro\n\n- a\n- b\n\n> quote\n</Card>');
        expect(card.props).toMatchObject({ title: 'T', body: 'Intro' });
        expect(types(card.children ?? [])).toEqual(['list', 'quote']);
        expect(isValid([card])).toBe(true);
    });

    it('keeps code inside a card as a markdown child', () => {
        const [card] = markdownToBlocks('<Card title="C">\n```\nx\n```\n</Card>');
        expect(card.props).toMatchObject({ title: 'C', body: '' });
        expect(types(card.children ?? [])).toEqual(['markdown']);
    });

    it('supports cards without a title and drops empty cards', () => {
        const [card] = markdownToBlocks('<Card>\nJust text\n</Card>');
        expect(card.props).toMatchObject({ title: '', body: 'Just text' });
        expect(markdownToBlocks('<Card></Card>')).toEqual([]);
        expect(markdownToBlocks('<Card title="Only title"></Card>')).toHaveLength(1);
    });

    it('maps <Center> to a centred column with centred text', () => {
        const blocks = markdownToBlocks('<Center>\n# Title\n\nText\n\n- item\n</Center>');
        expect(types(blocks)).toEqual(['row']);
        expect(blocks[0].props).toEqual({
            direction: 'column',
            gap: 'sm',
            align: 'center',
            justify: 'start',
            wrap: false,
        });
        const children = blocks[0].children ?? [];
        expect(types(children)).toEqual(['heading', 'paragraph', 'list']);
        expect(children[0].props).toMatchObject({ text: 'Title', level: 2, align: 'center' });
        expect(children[1].props).toMatchObject({ text: 'Text', align: 'center' });
        expect(isValid(blocks)).toBe(true);
    });

    it('does not centre text outside <Center>', () => {
        const [heading, paragraph] = markdownToBlocks('# T\n\nText');
        expect(heading.props).toMatchObject({ align: 'inherit' });
        expect(paragraph.props).toMatchObject({ align: 'inherit' });
    });

    it('maps <Flex> to a responsive row', () => {
        const blocks = markdownToBlocks('<Flex>\n<Card title="A">\nx\n</Card>\n<Card title="B">\ny\n</Card>\n</Flex>');
        expect(types(blocks)).toEqual(['row']);
        expect(blocks[0].props).toMatchObject({ direction: 'responsive' });
        expect(blocks[0].children?.map((child) => child.props)).toMatchObject([
            { title: 'A', body: 'x' },
            { title: 'B', body: 'y' },
        ]);
    });

    it('drops empty layout tags', () => {
        expect(markdownToBlocks('<Flex></Flex>')).toEqual([]);
        expect(markdownToBlocks('<Center>\n\n</Center>')).toEqual([]);
    });

    it('maps <Accordion title> to an accordion with one item', () => {
        const [accordion] = markdownToBlocks('<Accordion title="Learn More">\nFirst\n\nSecond\n</Accordion>');
        expect(accordion.type).toBe('accordion');
        expect(accordion.props).toEqual({ items: [{ title: 'Learn More', body: 'First\n\nSecond' }] });
    });

    it('keeps list content inside accordions as text', () => {
        const [accordion] = markdownToBlocks('<Accordion title="Q">\nIntro\n\n- a\n- b\n</Accordion>');
        expect(accordion.props).toEqual({ items: [{ title: 'Q', body: 'Intro\n\n- a\n- b' }] });
    });

    it('gives untitled accordions a title so they stay valid', () => {
        const [accordion] = markdownToBlocks('<Accordion>\nBody\n</Accordion>');
        expect(accordion.props).toEqual({ items: [{ title: 'Details', body: 'Body' }] });
        expect(isValid([accordion])).toBe(true);
    });

    it('maps both <Badges> forms', () => {
        expect(markdownToBlocks('<Badges>Values, Excellence ,  Service,, </Badges>')[0].props).toEqual({
            items: ['Values', 'Excellence', 'Service'],
        });
        const [attr] = markdownToBlocks('<Badges tags="a, b" />');
        expect(attr.type).toBe('badges');
        expect(attr.props).toEqual({ items: ['a', 'b'] });
        expect(markdownToBlocks('<Badges></Badges>')).toEqual([]);
    });

    it('splits and trims oversized badge lists', () => {
        const many = Array.from({ length: LIMITS.badgeItems + 1 }, (_, index) => `b${index}`).join(', ');
        const blocks = markdownToBlocks(`<Badges>${many}</Badges>`);
        expect(types(blocks)).toEqual(['badges', 'badges']);
        const [long] = markdownToBlocks(`<Badges>${'x'.repeat(100)}</Badges>`);
        expect(itemsOf(long)[0]).toHaveLength(80);
        expect(isValid([...blocks, long])).toBe(true);
    });

    it('converts the legacy welcome hero', () => {
        const blocks = markdownToBlocks(WELCOME_HERO);
        expect(types(blocks)).toEqual(['heading', 'row', 'row', 'accordion', 'badges']);
        expect(blocks[0].props).toMatchObject({ text: 'Welcome to San Isidro College', level: 2 });

        expect(blocks[1].props).toMatchObject({ direction: 'column', align: 'center' });
        expect(blocks[1].children?.map((child) => child.props)).toMatchObject([
            { text: 'Empowering minds, cultivating values, and inspiring service since 1949.', align: 'center' },
        ]);

        expect(blocks[2].props).toMatchObject({ direction: 'responsive' });
        expect(blocks[2].children?.map((child) => child.type)).toEqual(['card', 'card']);
        expect(blocks[2].children?.map((child) => child.props)).toMatchObject([
            { title: 'Academic Programs' },
            { title: 'Campus Life' },
        ]);
        expect(blocks[3].props).toMatchObject({ items: [{ title: 'Learn More About SIC' }] });
        expect(blocks[4].props).toEqual({ items: ['Values', 'Excellence', 'Service', 'Innovation'] });
    });
});

describe('markdownToBlocks: malformed input', () => {
    it('closes unbalanced tags at the end and ignores stray closers', () => {
        const unclosed = markdownToBlocks('<Card title="T">\nBody');
        expect(unclosed[0].props).toMatchObject({ title: 'T', body: 'Body' });

        const stray = markdownToBlocks('Text\n</Card>\n</Flex>\nMore');
        expect(stray.map((block) => block.props)).toMatchObject([{ text: 'Text' }, { text: 'More' }]);
    });

    it('closes inner tags when an outer tag closes', () => {
        const blocks = markdownToBlocks('<Center>\n<Flex>\nA\n</Center>\nB');
        expect(types(blocks)).toEqual(['row', 'paragraph']);
        expect(blocks[0].props).toMatchObject({ direction: 'column' });
        expect(blocks[0].children?.[0].props).toMatchObject({ direction: 'responsive' });
        expect(blocks[0].children?.[0].children?.[0].props).toMatchObject({ text: 'A' });
        expect(blocks[1].props).toMatchObject({ text: 'B', align: 'inherit' });
    });

    it('never throws and always yields valid blocks', () => {
        const inputs = [
            '<Card title="x',
            '<Badges>',
            '</Accordion></Flex>',
            '<Flex><Center><Card>',
            '<Card>\n<Accordion title="a">\n</Card>\ntext',
            '</Card>'.repeat(50),
            `${'<Flex>'.repeat(5000)}x`,
            '```\nunterminated',
            '# \n- \n> \n1. ',
            '\uE000\uE001 \uE0000\uE001',
        ];
        for (const input of inputs) {
            const blocks = markdownToBlocks(input);
            expect(isValid(blocks), input.slice(0, 30)).toBe(true);
        }
    });
});

describe('markdownToBlocks: limits', () => {
    it('keeps the nesting depth within LIMITS.depth without losing content', () => {
        const flex = markdownToBlocks(`${'<Flex>'.repeat(8)}deep${'</Flex>'.repeat(8)}`);
        expect(isValid(flex)).toBe(true);
        expect(subtreeDepth(flex[0])).toBeLessThanOrEqual(LIMITS.depth);
        expect(flatten(flex).some((entry) => entry.block.type === 'paragraph')).toBe(true);

        const cards = markdownToBlocks(`${'<Card title="c">'.repeat(8)}inner text${'</Card>'.repeat(8)}`);
        expect(isValid(cards)).toBe(true);
        expect(cards.every((block) => subtreeDepth(block) <= LIMITS.depth)).toBe(true);
        expect(JSON.stringify(cards)).toContain('inner text');
    });

    it('falls back to markdown blocks when there are too many blocks', () => {
        const source = Array.from({ length: LIMITS.blocks + 100 }, (_, index) => `Paragraph ${index}`).join('\n\n');
        const blocks = markdownToBlocks(source);
        expect(types(blocks)).toEqual(['markdown']);
        expect(blocks[0].props).toEqual({ source });
        expect(isValid(blocks)).toBe(true);
    });
});

describe('markdownToBlocks: seed content', () => {
    it('converts every seed string into a valid document', () => {
        for (const source of SEED_STRINGS) {
            const blocks = markdownToBlocks(source);
            expect(blocks.length, source.slice(0, 30)).toBeGreaterThan(0);
            const result = validateDocument(createDocument(blocks));
            expect(result.ok, source.slice(0, 30)).toBe(true);
            // Nothing becomes an unconverted markdown block for plain seed content.
            expect(flatten(blocks).some((entry) => entry.block.type === 'markdown')).toBe(false);
        }
    });

    it('converts a post with headings, lists and a quote', () => {
        const blocks = markdownToBlocks(SEED_STRINGS[9]);
        expect(types(blocks)).toEqual(['heading', 'paragraph', 'paragraph', 'quote']);
        expect(blocks[3].props).toMatchObject({ text: expect.stringContaining('This laboratory provides') });

        const events = markdownToBlocks(SEED_STRINGS[8]);
        expect(types(events)).toEqual(['heading', 'paragraph', 'heading', 'list']);
        expect(events[2].props).toMatchObject({ text: 'Schedule of Key Events', level: 4 });
        expect(events[3].props).toMatchObject({ ordered: false });
    });

    it('renders converted blocks without raw script tags', () => {
        for (const source of SEED_STRINGS) {
            const html = renderBlocks(markdownToBlocks(source));
            expect(html.length).toBeGreaterThan(0);
            expect(html).not.toContain('<script');
            expect(html).not.toContain('<h1');
        }
    });

    it('escapes hostile content after conversion', () => {
        const hostile = [
            '# <script>alert(1)</script>',
            '<script>alert(1)</script>',
            '- <script>alert(1)</script>',
            '> <script>alert(1)</script>',
            '<Card title="<script>alert(1)</script>">\n<script>alert(1)</script>\n</Card>',
            '<Accordion title="<script>alert(1)</script>">\n<script>alert(1)</script>\n</Accordion>',
            '<Badges><script>alert(1)</script></Badges>',
            '<Center>\n<script>alert(1)</script>\n</Center>',
            '```\n<script>alert(1)</script>\n```',
            '[x](javascript:alert(1))',
            '![<script>](/a.png)',
        ].join('\n\n');
        const blocks = markdownToBlocks(hostile);
        expect(isValid(blocks)).toBe(true);
        const html = renderBlocks(blocks);
        expect(html).not.toContain('<script');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('&lt;script&gt;');
    });
});
