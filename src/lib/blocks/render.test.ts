import { describe, expect, it } from 'vite-plus/test';
import { renderContent } from './content';
import { createBlock, createDocument, serializeDocument } from './document';
import { renderBlocks, renderDocument } from './render';
import type { Block } from './types';

const render = (block: Block, options?: { editor?: boolean }) => renderBlocks([block], options);
const count = (html: string, needle: string) => html.split(needle).length - 1;

const XSS = '<script>alert(1)</script>';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('renderBlocks: wrapper', () => {
    it('returns an empty string when nothing renders', () => {
        expect(renderBlocks([])).toBe('');
        expect(renderDocument(createDocument([]))).toBe('');
    });

    it('wraps content in the standard flow container', () => {
        const html = render(createBlock('paragraph', { text: 'Hello' }));
        expect(html.startsWith('<div class="flex flex-col gap-5" data-sic-blocks>')).toBe(true);
        expect(html.endsWith('</div>')).toBe(true);
        expect(html).toContain('Hello');
        expect(renderDocument(createDocument([createBlock('paragraph', { text: 'Hello' })]))).toContain('Hello');
    });
});

describe('renderBlocks: escaping', () => {
    it('escapes text in every block type', () => {
        const row = createBlock('row');
        row.children = [
            createBlock('heading', { text: XSS }),
            createBlock('paragraph', { text: XSS }),
            createBlock('list', { items: [XSS] }),
            createBlock('list', { ordered: true, items: [XSS] }),
            createBlock('quote', { text: XSS, cite: XSS }),
            createBlock('button', { label: XSS, href: '/x' }),
            createBlock('badges', { items: [XSS] }),
            createBlock('card', {
                title: XSS,
                body: XSS,
                imageUrl: 'https://example.com/a.png',
                imageAlt: XSS,
                linkLabel: XSS,
                linkHref: '/y',
            }),
            createBlock('image', { src: 'https://example.com/a.png', alt: XSS, caption: XSS }),
            createBlock('table', {
                caption: XSS,
                rows: [
                    [XSS, XSS],
                    [XSS, XSS],
                ],
            }),
            createBlock('accordion', { items: [{ title: XSS, body: XSS }] }),
            createBlock('callout', { title: XSS, text: XSS }),
            createBlock('stats', { items: [{ value: XSS, label: XSS, hint: XSS }] }),
            createBlock('video', { url: YOUTUBE, title: XSS, caption: XSS }),
            createBlock('event', { title: XSS, start: '2026-08-15', location: XSS, note: XSS }),
            createBlock('markdown', { source: `# ${XSS}\n\n${XSS}\n\n- ${XSS}` }),
        ];
        const section = createBlock('section');
        section.children = [row];

        for (const editor of [false, true]) {
            const html = renderBlocks([section], { editor });
            expect(html).not.toContain('<script');
            expect(html).toContain('&lt;script&gt;');
        }
    });

    it('escapes quotes and angle brackets in attributes', () => {
        const alt = '"><img src=x onerror=alert(1)>';
        const html = render(createBlock('image', { src: 'https://example.com/a.png?x="y"', alt }));
        expect(html).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
        expect(html).toContain('src="https://example.com/a.png?x=&quot;y&quot;"');
        expect(html).not.toContain('<img src=x');

        const video = render(createBlock('video', { url: YOUTUBE, title: 'a" onload="x' }));
        expect(video).toContain('title="a&quot; onload=&quot;x"');
        expect(video).not.toContain('onload="');

        const button = render(createBlock('button', { label: 'Go', href: '/a"onmouseover="x' }));
        expect(button).toContain('href="/a&quot;onmouseover=&quot;x"');
        expect(button).not.toContain('onmouseover="');

        const card = render(createBlock('card', { title: 'T', imageUrl: '/a.png', imageAlt: 'x" onerror="y' }));
        expect(card).toContain('alt="x&quot; onerror=&quot;y"');
        expect(card).not.toContain('onerror="');
    });

    it('escapes block ids in editor hooks', () => {
        const block = createBlock('paragraph', { text: 'x' });
        block.id = 'a"b';
        expect(render(block, { editor: true })).toContain('data-block-id="a&quot;b"');
    });
});

describe('renderBlocks: unsafe URLs', () => {
    it('omits buttons with unsafe links', () => {
        for (const href of ['javascript:alert(1)', ' java\tscript:alert(1)', 'data:text/html,x', '//evil.com', '']) {
            expect(render(createBlock('button', { label: 'Go', href })), JSON.stringify(href)).toBe('');
        }
        expect(render(createBlock('button', { label: '', href: '/x' }))).toBe('');
    });

    it('renders inline links with unsafe targets as plain text', () => {
        const paragraph = render(createBlock('paragraph', { text: '[click](javascript:alert(1))' }));
        expect(paragraph).toContain('click');
        expect(paragraph).not.toContain('javascript');
        expect(paragraph).not.toContain('<a ');

        const list = render(createBlock('list', { items: ['[go](data:text/html,x)'] }));
        expect(list).toContain('go');
        expect(list).not.toContain('<a ');
        expect(list).not.toContain('data:');
    });

    it('drops unsafe images and card links', () => {
        expect(render(createBlock('image', { src: 'javascript:alert(1)', alt: 'x' }))).toBe('');
        expect(render(createBlock('image', { src: 'data:image/png;base64,AAAA', alt: 'x' }))).toBe('');

        const card = render(
            createBlock('card', {
                title: 'T',
                imageUrl: 'javascript:alert(1)',
                linkLabel: 'Go',
                linkHref: 'javascript:alert(1)',
            }),
        );
        expect(card).toContain('T');
        expect(card).not.toContain('<img');
        expect(card).not.toContain('<a ');
        expect(card).not.toContain('javascript');
    });

    it('adds rel noopener noreferrer to external links only', () => {
        const external = render(createBlock('paragraph', { text: '[x](https://example.com)' }));
        expect(external).toContain('target="_blank" rel="noopener noreferrer"');
        expect(render(createBlock('paragraph', { text: '[x](/about)' }))).not.toContain('rel=');
        expect(render(createBlock('paragraph', { text: '[x](mailto:a@example.com)' }))).not.toContain('target=');

        expect(render(createBlock('button', { label: 'Go', href: 'https://example.com' }))).toContain(
            'target="_blank" rel="noopener noreferrer"',
        );
        expect(render(createBlock('button', { label: 'Go', href: '/apply' }))).not.toContain('rel=');
        expect(render(createBlock('card', { title: 'T', linkLabel: 'Go', linkHref: 'https://example.com' }))).toContain(
            'rel="noopener noreferrer"',
        );
        expect(render(createBlock('card', { title: 'T', linkLabel: 'Go', linkHref: '/apply' }))).not.toContain('rel=');
    });
});

describe('renderBlocks: headings', () => {
    it('clamps levels to h2-h4 and never emits h1, h5 or h6', () => {
        const expected: [unknown, string][] = [
            [1, 'h2'],
            [2, 'h2'],
            [3, 'h3'],
            [4, 'h4'],
            [5, 'h2'],
            [6, 'h2'],
            [0, 'h2'],
            [99, 'h2'],
            ['3', 'h2'],
            ['x', 'h2'],
            [null, 'h2'],
            [undefined, 'h2'],
        ];
        for (const [level, tag] of expected) {
            const html = render(createBlock('heading', { text: 'Title', level: level as never }));
            expect(html, String(level)).toContain(`<${tag} `);
            expect(html, String(level)).toContain(`>Title</${tag}>`);
            expect(html).not.toMatch(/<h[156][ >]/);
        }
    });

    it('never emits h1 for any block', () => {
        const row = createBlock('row');
        row.children = [
            createBlock('heading', { level: 1 as never }),
            createBlock('card', { title: 'Card' }),
            createBlock('markdown', { source: '# One\n\n## Two' }),
            createBlock('event', { title: 'E', start: '2026-08-15' }),
        ];
        expect(render(row)).not.toContain('<h1');
    });

    it('skips empty headings', () => {
        expect(render(createBlock('heading', { text: '   ' }))).toBe('');
    });
});

describe('renderBlocks: media', () => {
    it('renders lazy images with dimensions when known', () => {
        const html = render(
            createBlock('image', {
                src: '/storage/a.png',
                alt: 'A tree',
                width: 800,
                height: 600,
                caption: 'Our tree',
            }),
        );
        expect(html).toContain(
            '<img src="/storage/a.png" alt="A tree" width="800" height="600" loading="lazy" decoding="async"',
        );
        expect(html).toContain('<figcaption');
        expect(html).toContain('Our tree');
    });

    it('omits width and height when unknown or invalid', () => {
        const unknown = render(createBlock('image', { src: '/a.png', alt: 'x' }));
        expect(unknown).toContain('loading="lazy"');
        expect(unknown).toContain('decoding="async"');
        expect(unknown).not.toContain('width=');
        expect(unknown).not.toContain('height=');
        expect(render(createBlock('image', { src: '/a.png', alt: 'x', width: 800, height: null }))).not.toContain(
            'width=',
        );
        expect(render(createBlock('image', { src: '/a.png', alt: 'x', width: 0, height: 10 }))).not.toContain('width=');
    });

    it('uses an empty alt for decorative images', () => {
        const html = render(createBlock('image', { src: '/a.png', alt: 'Ignored', decorative: true }));
        expect(html).toContain('alt=""');
        expect(html).not.toContain('Ignored');
    });

    it('renders only whitelisted videos as privacy-friendly sandboxed iframes with a title', () => {
        const youtube = render(createBlock('video', { url: YOUTUBE, title: 'Campus tour', caption: 'Filmed in 2026' }));
        expect(youtube).toContain('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
        expect(youtube).toContain('title="Campus tour"');
        expect(youtube).toContain('sandbox="');
        expect(youtube).toContain('loading="lazy"');
        expect(youtube).toContain('Filmed in 2026');

        const vimeo = render(createBlock('video', { url: 'https://vimeo.com/123456789', title: 'Vimeo' }));
        expect(vimeo).toContain('src="https://player.vimeo.com/video/123456789?dnt=1"');

        for (const url of [
            'https://evil.com/watch?v=dQw4w9WgXcQ',
            'https://youtube.com.evil.com/watch?v=aaaaaaaaaaa',
            'javascript:alert(1)',
        ]) {
            expect(render(createBlock('video', { url, title: 'Bad' })), url).toBe('');
        }
        expect(render(createBlock('video', { url: YOUTUBE, title: '' }))).toBe('');
    });

    it('shows a title placeholder instead of the iframe in the editor', () => {
        const html = render(createBlock('video', { url: YOUTUBE, title: 'Campus tour' }), { editor: true });
        expect(html).not.toContain('<iframe');
        expect(html).toContain('Video: Campus tour');
    });
});

describe('renderBlocks: content blocks', () => {
    it('renders tables with thead, column headers and caption', () => {
        const html = render(
            createBlock('table', {
                caption: 'Fees',
                rows: [
                    ['Name', 'Fee'],
                    ['Tuition', '**100**'],
                ],
            }),
        );
        expect(html).toContain('<caption');
        expect(html).toContain('>Fees</caption>');
        expect(html).toContain('<thead><tr><th scope="col"');
        expect(html).toContain('>Name</th>');
        expect(html).toContain('<tbody><tr><td');
        expect(html).toContain('<strong');
        expect(count(html, '<th ')).toBe(2);
        expect(count(html, '<td ')).toBe(2);
    });

    it('renders every row as body rows without a header', () => {
        const html = render(
            createBlock('table', {
                header: false,
                rows: [
                    ['a', 'b'],
                    ['c', 'd'],
                ],
            }),
        );
        expect(html).not.toContain('<thead');
        expect(html).not.toContain('<th ');
        expect(html).not.toContain('<caption');
        expect(count(html, '<tr>')).toBe(2);
    });

    it('renders accordions as details/summary and skips untitled items', () => {
        const html = render(
            createBlock('accordion', {
                items: [
                    { title: 'Question', body: 'First\n\nSecond' },
                    { title: '  ', body: 'Hidden' },
                ],
            }),
        );
        expect(count(html, '<details')).toBe(1);
        expect(html).toContain('<summary');
        expect(html).toContain('<span>Question</span>');
        expect(count(html, '<p ')).toBe(2);
        expect(html).not.toContain('Hidden');
        expect(render(createBlock('accordion', { items: [] }))).toBe('');
    });

    it('renders events with <time datetime>', () => {
        const range = render(
            createBlock('event', {
                title: 'Foundation Day',
                start: '2026-08-15T08:00',
                end: '2026-08-15T10:00',
                location: 'Gym',
                note: 'Bring ID',
            }),
        );
        expect(range).toContain(
            '<time datetime="2026-08-15T08:00">August 15, 2026, 8:00 AM</time> – <time datetime="2026-08-15T10:00">10:00 AM</time>',
        );
        expect(range).toContain('Foundation Day');
        expect(range).toContain('Gym');
        expect(range).toContain('Bring ID');

        const day = render(createBlock('event', { start: '2026-08-15' }));
        expect(day).toContain('<time datetime="2026-08-15">August 15, 2026</time>');

        const multi = render(createBlock('event', { start: '2026-08-15', end: '2026-08-17' }));
        expect(multi).toContain(
            '<time datetime="2026-08-15">August 15, 2026</time> – <time datetime="2026-08-17">August 17, 2026</time>',
        );

        const reversed = render(createBlock('event', { start: '2026-08-17', end: '2026-08-15' }));
        expect(count(reversed, '<time ')).toBe(1);
    });

    it('renders events without a valid date from title or location only', () => {
        const html = render(createBlock('event', { title: 'Open house', start: 'soon', location: 'Main hall' }));
        expect(html).not.toContain('<time');
        expect(html).toContain('Open house');
        expect(html).toContain('Main hall');
        expect(render(createBlock('event'))).toBe('');
    });

    it('renders unordered and ordered lists, skipping blank items', () => {
        const ul = render(createBlock('list', { items: ['a', ' ', 'b'] }));
        expect(ul).toContain('<ul ');
        expect(count(ul, '<li ')).toBe(2);
        const ol = render(createBlock('list', { ordered: true, items: ['a'] }));
        expect(ol).toContain('<ol ');
        expect(ol).not.toContain('<ul');
        expect(render(createBlock('list', { items: [' '] }))).toBe('');
    });

    it('renders block quotes with an optional citation', () => {
        const html = render(createBlock('quote', { text: 'One\n\nTwo', cite: 'Ana' }));
        expect(html).toContain('<blockquote');
        expect(count(html, '<p ')).toBe(2);
        expect(html).toContain('<footer');
        expect(html).toContain('— Ana');
        expect(render(createBlock('quote', { text: 'One' }))).not.toContain('<footer');
        expect(render(createBlock('quote', { text: ' ' }))).toBe('');
    });

    it('renders callouts as notes with a screen reader label', () => {
        const html = render(createBlock('callout', { tone: 'warning', title: 'Heads up', text: 'Be careful' }));
        expect(html).toContain('role="note"');
        expect(html).toContain('<span class="sr-only">Warning: </span>Heads up');
        expect(html).toContain('Be careful');

        const untitled = render(createBlock('callout', { tone: 'info', title: '', text: 'Plain' }));
        expect(untitled).toContain('<p class="sr-only">Note</p>');
        expect(render(createBlock('callout', { title: '', text: '' }))).toBe('');
    });

    it('renders badges and stats', () => {
        const badges = render(createBlock('badges', { items: ['One', ' ', 'Two'] }));
        expect(count(badges, '<li ')).toBe(2);
        expect(render(createBlock('badges', { items: [] }))).toBe('');

        const stats = render(createBlock('stats', { items: [{ value: '25', label: 'Years', hint: '' }] }));
        expect(stats).toContain('<dl');
        expect(stats).toContain('25');
        expect(stats).toContain('Years');
    });

    it('renders buttons, spacers and dividers', () => {
        const button = render(createBlock('button', { label: 'Apply', href: '/apply' }));
        expect(button).toContain('<a href="/apply"');
        expect(button).toContain('>Apply</a>');
        expect(render(createBlock('spacer'))).toContain('aria-hidden="true"');
        expect(render(createBlock('divider'))).toContain('<hr');
    });

    it('renders markdown blocks with the legacy renderer', () => {
        const html = render(
            createBlock('markdown', { source: '# Title\n\n- a\n- b\n\n<Card title="Card">\nBody\n</Card>' }),
        );
        expect(html).toMatch(/<h2 [^>]*>Title<\/h2>/);
        expect(html).toContain('<ul ');
        expect(html).toContain('Card</h3>');
        expect(html).toContain('Body');
        expect(render(createBlock('markdown', { source: '' }))).toBe('');
    });
});

describe('renderBlocks: containers', () => {
    it('renders children inside their container', () => {
        const section = createBlock('section');
        const row = createBlock('row');
        row.children = [createBlock('paragraph', { text: 'Inside' })];
        section.children = [row];
        const html = render(section);
        expect(html).toContain('<section class="');
        expect(html).toContain('Inside');
        expect(html.indexOf('<section')).toBeLessThan(html.indexOf('Inside'));
    });

    it('renders cards with title, body and nested blocks', () => {
        const card = createBlock('card', { title: 'Card', body: 'Body text' });
        card.children = [createBlock('paragraph', { text: 'Nested' })];
        const html = render(card);
        expect(html).toContain('<article');
        expect(html).toContain('<h3 class="text-lg font-bold text-primary">Card</h3>');
        expect(html).toContain('Body text');
        expect(html).toContain('Nested');
    });

    it('renders nothing publicly for empty containers', () => {
        for (const type of ['section', 'row', 'grid', 'columns'] as const) {
            expect(render(createBlock(type)), type).toBe('');
        }
        expect(render(createBlock('card', { title: '', body: '' }))).toBe('');
        const nested = createBlock('section');
        nested.children = [createBlock('row')];
        expect(render(nested)).toBe('');
        expect(render(createBlock('paragraph', { text: '' }))).toBe('');
    });

    it('keeps empty containers selectable in the editor', () => {
        const html = render(createBlock('row'), { editor: true });
        expect(html).toContain('data-block-type="row"');
        expect(html).toContain('data-empty="true"');
    });
});

describe('renderBlocks: editor mode', () => {
    it('adds data-block hooks only in editor mode', () => {
        const block = createBlock('paragraph', { text: 'Hello' });
        const editor = render(block, { editor: true });
        expect(editor).toContain(`data-block-id="${block.id}"`);
        expect(editor).toContain('data-block-type="paragraph"');
        expect(editor).toContain('data-block-label="');

        const pub = render(block);
        expect(pub).not.toContain('data-block');
        expect(render(block, { editor: false })).not.toContain('data-block');
    });

    it('shows placeholders in the editor that never reach visitors', () => {
        expect(render(createBlock('paragraph', { text: '' }), { editor: true })).toContain('&nbsp;');
        expect(render(createBlock('image', { src: '' }), { editor: true })).toContain('Choose an image');
        expect(render(createBlock('image', { src: '' }))).toBe('');
        expect(render(createBlock('markdown', { source: '' }), { editor: true })).toContain('Empty Markdown block');
    });
});

describe('renderContent', () => {
    it('returns an empty string for empty content', () => {
        expect(renderContent('')).toBe('');
        expect(renderContent(null)).toBe('');
        expect(renderContent(undefined)).toBe('');
    });

    it('renders legacy Markdown with headings starting at h2 (no double shift)', () => {
        const html = renderContent('# A\n\n## B\n\n### C');
        expect(html).toMatch(/<h2 [^>]*>A<\/h2>/);
        expect(html).toMatch(/<h3 [^>]*>B<\/h3>/);
        expect(html).toMatch(/<h4 [^>]*>C<\/h4>/);
        expect(html).not.toContain('<h1');
        expect(renderContent('# A')).not.toContain('<h3');
    });

    it('treats brace-prefixed text without the marker as Markdown', () => {
        expect(renderContent('{"type":"sic-blocks"')).toContain('<p ');
        expect(renderContent('{"hello":1}')).toContain('<p ');
    });

    it('renders valid block documents with the block renderer', () => {
        const json = serializeDocument(
            createDocument([
                createBlock('heading', { text: 'Welcome', level: 2 }),
                createBlock('paragraph', { text: 'Hello **world**' }),
            ]),
        );
        const html = renderContent(json);
        expect(html).toContain('data-sic-blocks');
        expect(html).toMatch(/<h2 [^>]*>Welcome<\/h2>/);
        expect(html).toContain('<strong');
        expect(html).not.toContain('data-block');
    });

    it('renders nothing for an empty or invalid block document', () => {
        expect(renderContent(serializeDocument(createDocument([])))).toBe('');
        const unknown = '{"type":"sic-blocks","version":1,"blocks":[{"id":"a","type":"nope","props":{}}]}';
        expect(renderContent(unknown)).toBe('');
        const unsafe = JSON.stringify({
            type: 'sic-blocks',
            version: 1,
            blocks: [{ id: 'a', type: 'button', props: { label: 'Go', href: 'javascript:alert(1)' } }],
        });
        expect(renderContent(unsafe)).toBe('');
        expect(renderContent('{"type":"sic-blocks","version":1,"blocks":"x"}')).toBe('');
    });
});
