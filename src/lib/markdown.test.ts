import { describe, expect, it } from 'vite-plus/test';
import { parseMarkdown, toPlainText } from './markdown';

describe('parseMarkdown', () => {
    it('returns an empty string for empty input', () => {
        expect(parseMarkdown('')).toBe('');
        expect(parseMarkdown(null)).toBe('');
    });

    it('shifts content headings down one level, capped at h6', () => {
        const html = parseMarkdown('# One\n\n## Two\n\n###### Six');
        expect(html).not.toContain('<h1');
        expect(html).toMatch(/<h2 [^>]*>One<\/h2>/);
        expect(html).toMatch(/<h3 [^>]*>Two<\/h3>/);
        expect(html).toMatch(/<h6 [^>]*>Six<\/h6>/);
    });

    it('wraps unordered runs in a single <ul>', () => {
        const html = parseMarkdown('- a\n- b\n* c');
        expect(html.match(/<ul /g)).toHaveLength(1);
        expect(html.match(/<li /g)).toHaveLength(3);
        expect(html).not.toContain('<ol');
    });

    it('wraps numbered runs in <ol> and keeps separate lists apart', () => {
        const html = parseMarkdown('1. first\n2. second\n\ntext\n\n- bullet');
        expect(html).toMatch(/<ol [^>]*><li [^>]*>first<\/li><li [^>]*>second<\/li><\/ol>/);
        expect(html).toContain('<ul ');
        expect(html).toContain('<p ');
    });

    it('renders bold, italic and inline code', () => {
        const html = parseMarkdown('**b** and *i* and `c`');
        expect(html).toMatch(/<strong [^>]*>b<\/strong>/);
        expect(html).toMatch(/<em [^>]*>i<\/em>/);
        expect(html).toMatch(/<code [^>]*>c<\/code>/);
    });

    it('renders blockquotes and fenced code (escaped, tags untouched)', () => {
        const html = parseMarkdown('> quoted\n\n```js\nconst a = "<Card>x</Card>";\n```');
        expect(html).toMatch(/<blockquote [^>]*>quoted<\/blockquote>/);
        expect(html).toContain('<pre ');
        expect(html).toContain('&lt;Card&gt;x&lt;/Card&gt;');
        expect(html).not.toContain('<details');
    });

    it('renders <Card title> with a title and body', () => {
        const html = parseMarkdown('<Card title="Hello">\nBody text\n</Card>');
        expect(html).toContain('Hello</h3>');
        expect(html).toContain('Body text');
        expect(html.match(/<div/g)).toHaveLength(html.match(/<\/div>/g)!.length);
    });

    it('renders <Card> without a title', () => {
        const html = parseMarkdown('<Card>\nPlain\n</Card>');
        expect(html).toContain('Plain');
        expect(html).not.toContain('<h3');
    });

    it('renders <Center> and <Flex> wrappers with nested cards', () => {
        const html = parseMarkdown(
            '<Center>\nMiddle\n</Center>\n\n<Flex>\n<Card title="A">\na\n</Card>\n<Card title="B">\nb\n</Card>\n</Flex>',
        );
        expect(html).toContain('items-center');
        expect(html).toContain('md:flex-row');
        expect(html.match(/<div/g)).toHaveLength(html.match(/<\/div>/g)!.length);
        expect(html.indexOf('>A</h3>')).toBeLessThan(html.indexOf('>B</h3>'));
    });

    it('renders <Accordion> as details/summary', () => {
        const html = parseMarkdown('<Accordion title="More">\nHidden\n</Accordion>');
        expect(html).toContain('<details');
        expect(html).toMatch(/<summary [^>]*><span>More<\/span>/);
        expect(html).toContain('Hidden');
        expect(html).toContain('</details>');
    });

    it('renders <Badges> in both forms and escapes the items', () => {
        const body = parseMarkdown('<Badges>One, Two <b></Badges>');
        expect(body.match(/<span /g)).toHaveLength(2);
        expect(body).toContain('Two &lt;b&gt;');
        const attr = parseMarkdown('<Badges tags="x, y, z" />');
        expect(attr.match(/<span /g)).toHaveLength(3);
    });

    it('closes unbalanced tags and ignores stray closers', () => {
        const html = parseMarkdown('</Card>\n<Center>\nopen');
        expect(html.match(/<div/g)).toHaveLength(html.match(/<\/div>/g)!.length);
    });

    it('escapes raw HTML and scripts in text', () => {
        const html = parseMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> & "q"');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('<img');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('&amp;');
        expect(html).toContain('&quot;q&quot;');
    });

    it('escapes headings, list items and quotes too', () => {
        const html = parseMarkdown('# <b>x</b>\n\n- <i>y</i>\n\n> <u>z</u>');
        expect(html).not.toMatch(/<(b|i|u)>/);
    });

    it('neutralises javascript: links', () => {
        const html = parseMarkdown('[x](javascript:alert(1))');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('href="#"');
    });

    it('opens external links in a new tab with rel=noopener only', () => {
        const external = parseMarkdown('[site](https://example.com/a?b=1&c=2)');
        expect(external).toContain('href="https://example.com/a?b=1&amp;c=2"');
        expect(external).toContain('target="_blank"');
        expect(external).toContain('rel="noopener"');

        const internal = parseMarkdown('[home](/posts) [mail](mailto:a@b.co)');
        expect(internal).toContain('href="/posts"');
        expect(internal).not.toContain('target=');
        expect(internal).not.toContain('rel=');
    });

    it('renders images lazily with alt text', () => {
        const html = parseMarkdown('![A campus](/storage/posts/a.jpg)');
        expect(html).toContain('src="/storage/posts/a.jpg"');
        expect(html).toContain('alt="A campus"');
        expect(html).toContain('loading="lazy"');
        expect(html).toContain('decoding="async"');
    });

    it('strips MDX import lines', () => {
        expect(parseMarkdown("import Foo from './foo';\n\nText")).not.toContain('import');
    });

    it('emits no prose, hex colours or invalid neutral classes', () => {
        const html = parseMarkdown(
            '# T\n\n- a\n1. b\n\n> q\n\n<Card title="c">\nx\n</Card>\n<Accordion title="a">\ny\n</Accordion>\n<Badges>a, b</Badges>\n\n```\ncode\n```\n\n[l](https://x.y) ![i](/a.png)',
        );
        expect(html).not.toMatch(/prose/);
        expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(html).not.toMatch(/neutral-|amber-|dark:/);
    });
});

describe('toPlainText', () => {
    it('strips markdown, MDX-lite tags and collapses whitespace', () => {
        const text = toPlainText(
            '# Title\n\n<Card title="X">\n**Bold** [link](https://a.b) text\n</Card>\n\n- item one\n1. item two\n> quote\n\n`code`',
        );
        expect(text).toBe('Title Bold link text item one item two quote code');
    });

    it('drops images, keeps badge attribute text and handles empty input', () => {
        expect(toPlainText('![alt](/a.png) hi <Badges tags="a, b" />')).toBe('hi a, b');
        expect(toPlainText(null)).toBe('');
    });
});
