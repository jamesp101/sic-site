import { describe, expect, it } from 'vite-plus/test';
import { escapeInline, inlineToHtml, inlineToText, paragraphsOf } from './inline';

describe('inlineToHtml', () => {
    it('renders bold and italic', () => {
        expect(inlineToHtml('**bold**')).toBe('<strong class="font-bold text-primary">bold</strong>');
        expect(inlineToHtml('*italic*')).toBe('<em class="italic">italic</em>');
        expect(inlineToHtml('a **b** and *c* d')).toBe(
            'a <strong class="font-bold text-primary">b</strong> and <em class="italic">c</em> d',
        );
    });

    it('renders links, opening external ones safely', () => {
        const external = inlineToHtml('[SIC](https://example.com/a?b=1)');
        expect(external).toContain('<a href="https://example.com/a?b=1"');
        expect(external).toContain('target="_blank" rel="noopener noreferrer"');
        expect(external).toContain('>SIC</a>');

        const internal = inlineToHtml('[About](/about)');
        expect(internal).toContain('href="/about"');
        expect(internal).not.toContain('target=');
        expect(internal).not.toContain('rel=');

        expect(inlineToHtml('[mail](mailto:info@example.com)')).toContain('href="mailto:info@example.com"');
    });

    it('lets a backslash escape the next character', () => {
        expect(inlineToHtml('a \\*b\\* c')).toBe('a *b* c');
        expect(inlineToHtml('\\[x\\](y)')).toBe('[x](y)');
        expect(inlineToHtml('back\\\\slash')).toBe('back\\slash');
        expect(inlineToHtml('**x** \\*y\\*')).toBe('<strong class="font-bold text-primary">x</strong> *y*');
        expect(inlineToHtml('trailing\\')).toBe('trailing\\');
    });

    it('nests emphasis and links', () => {
        expect(inlineToHtml('**bold *it* more**')).toBe(
            '<strong class="font-bold text-primary">bold <em class="italic">it</em> more</strong>',
        );
        expect(inlineToHtml('*a **b** c*')).toBe(
            '<em class="italic">a <strong class="font-bold text-primary">b</strong> c</em>',
        );
        const link = inlineToHtml('[**bold** link](/x)');
        expect(link).toContain('<a href="/x"');
        expect(link).toContain('<strong class="font-bold text-primary">bold</strong> link</a>');
    });

    it('leaves unbalanced markers as literal text', () => {
        expect(inlineToHtml('**bold')).toBe('**bold');
        expect(inlineToHtml('*x')).toBe('*x');
        expect(inlineToHtml('5 * 3')).toBe('5 * 3');
        expect(inlineToHtml('****')).toBe('****');
        expect(inlineToHtml('[label](')).toBe('[label](');
        expect(inlineToHtml('[label]')).toBe('[label]');
        expect(inlineToHtml('[a](b')).toBe('[a](b');
        expect(inlineToHtml('[](x)')).toBe('[](x)');
        expect(inlineToHtml('a ) ] b')).toBe('a ) ] b');
    });

    it('turns newlines into <br>', () => {
        expect(inlineToHtml('one\ntwo')).toBe('one<br>two');
    });

    it('escapes HTML in text, labels and urls', () => {
        expect(inlineToHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
        expect(inlineToHtml('**<b>**')).toContain('&lt;b&gt;');
        expect(inlineToHtml('[<i>x</i>](/a)')).toContain('&lt;i&gt;x&lt;/i&gt;</a>');
        const quoted = inlineToHtml('[x](/a"b)');
        expect(quoted).toContain('href="/a&quot;b"');
        expect(quoted).not.toContain('href="/a"b');
        expect(inlineToHtml("it's & co")).toBe('it&#39;s &amp; co');
    });

    it('drops unsafe link targets but keeps the label as text', () => {
        expect(inlineToHtml('[x](javascript:alert(1))')).toBe('x)');
        for (const href of [
            'javascript:void(0',
            'JaVaScRiPt:alert`1`',
            'data:text/html,hi',
            'java\nscript:alert',
            'vbscript:x',
            '//evil.com',
            'ftp://x.y',
        ]) {
            const html = inlineToHtml(`[click](${href})`);
            expect(html, href).toBe('click');
            expect(html).not.toContain('href');
        }
    });

    it('supports escaped parentheses inside link urls', () => {
        expect(inlineToHtml('[wiki](https://a.example/x\\(b\\))')).toContain('href="https://a.example/x(b)"');
    });

    it('stops interpreting markup beyond a safe nesting depth', () => {
        const html = inlineToHtml('*a *b *c *d *e* d* c* b* a*');
        expect(html).not.toContain('<script');
        expect(html.length).toBeGreaterThan(0);
    });
});

describe('inlineToText', () => {
    it('strips markup and keeps link labels', () => {
        expect(inlineToText('**b** *i* [l](https://x.example) t')).toBe('b i l t');
        expect(inlineToText('one\ntwo')).toBe('one two');
        expect(inlineToText('a \\*b\\*')).toBe('a *b*');
        expect(inlineToText('<b>')).toBe('<b>');
    });
});

describe('escapeInline', () => {
    it('escapes the special characters', () => {
        expect(escapeInline('a*b')).toBe('a\\*b');
        expect(escapeInline('[x](y)')).toBe('\\[x\\]\\(y\\)');
        expect(escapeInline('a\\b')).toBe('a\\\\b');
        expect(escapeInline('plain text')).toBe('plain text');
    });

    it('round trips arbitrary text through inlineToText', () => {
        const samples = [
            'plain',
            '*star*',
            '**double**',
            '[label](https://example.com)',
            'back\\slash',
            'trailing\\',
            '(parens) [brackets]',
            '5 * 3 * 2',
            '\\*',
            '***',
            'mixed *a* **b** [c](d) \\ e',
        ];
        for (const sample of samples) {
            expect(inlineToText(escapeInline(sample)), sample).toBe(sample);
        }
    });

    it('produces no markup when rendered to HTML', () => {
        for (const sample of ['*star*', '**double**', '[label](https://example.com)', '**a** *b* [c](/d)']) {
            const html = inlineToHtml(escapeInline(sample));
            expect(html, sample).not.toContain('<strong');
            expect(html, sample).not.toContain('<em');
            expect(html, sample).not.toContain('<a ');
            expect(html, sample).toBe(sample);
        }
        expect(inlineToHtml(escapeInline('<b>&"'))).toBe('&lt;b&gt;&amp;&quot;');
    });
});

describe('paragraphsOf', () => {
    it('splits on blank lines and trims', () => {
        expect(paragraphsOf('a\n\nb\r\n\r\nc\n\n\n')).toEqual(['a', 'b', 'c']);
        expect(paragraphsOf('  a  \n\n\n\n  b ')).toEqual(['a', 'b']);
    });

    it('keeps single newlines inside a paragraph', () => {
        expect(paragraphsOf('line 1\nline 2')).toEqual(['line 1\nline 2']);
    });

    it('returns nothing for empty input', () => {
        expect(paragraphsOf('')).toEqual([]);
        expect(paragraphsOf(' \n\n \n')).toEqual([]);
    });
});
