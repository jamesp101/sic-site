import { describe, expect, it } from 'vite-plus/test';
import { isExternalHref, parseVideoUrl, safeHref, safeImageSrc } from './urls';

describe('safeHref', () => {
    it.each([
        ['https://example.com', 'https://example.com'],
        ['http://a.example/b?c=d#e', 'http://a.example/b?c=d#e'],
        ['HTTPS://EXAMPLE.COM', 'HTTPS://EXAMPLE.COM'],
        ['/admissions', '/admissions'],
        ['relative/path', 'relative/path'],
        ['page?x=1', 'page?x=1'],
        ['#top', '#top'],
        ['?q=1', '?q=1'],
        ['mailto:info@example.com', 'mailto:info@example.com'],
        ['tel:+639171234567', 'tel:+639171234567'],
        ['  /spaced  ', '/spaced'],
        ['/a:b', '/a:b'],
        ['path/with:colon', 'path/with:colon'],
    ])('accepts %j', (input, expected) => {
        expect(safeHref(input)).toBe(expected);
    });

    it.each([
        ['null', null],
        ['undefined', undefined],
        ['number', 42],
        ['object', {}],
        ['empty', ''],
        ['spaces', '   '],
        ['javascript', 'javascript:alert(1)'],
        ['uppercase javascript', 'JAVASCRIPT:alert(1)'],
        ['mixed case javascript', 'JaVaScRiPt:alert(1)'],
        ['leading space', ' javascript:alert(1)'],
        ['embedded newline', 'jav\nascript:alert(1)'],
        ['embedded tab', 'java\tscript:alert(1)'],
        ['embedded carriage return', 'java\rscript:alert(1)'],
        ['embedded space', 'java script:alert(1)'],
        ['NUL byte', 'java\u0000script:alert(1)'],
        ['leading control char', '\u0001javascript:alert(1)'],
        ['zero-width space', 'java\u200bscript:alert(1)'],
        ['zero-width joiner', 'java\u200dscript:alert(1)'],
        ['BOM', '\ufeffjavascript:alert(1)'],
        ['line separator', 'java\u2028script:alert(1)'],
        ['C1 control', 'java\u0085script:alert(1)'],
        ['fullwidth letter', '\uff4aavascript:alert(1)'],
        ['non-breaking space', 'java\u00a0script:alert(1)'],
        ['vbscript', 'vbscript:msgbox(1)'],
        ['data', 'data:text/html;base64,PHNjcmlwdD4='],
        ['file', 'file:///etc/passwd'],
        ['ftp', 'ftp://example.com/x'],
        ['unknown scheme', 'x:y'],
        ['drive letter', 'C:\\path'],
        ['protocol relative', '//evil.com'],
        ['protocol relative with space', '  //evil.com'],
        ['protocol relative with tab', '/\t/evil.com'],
        ['protocol relative with space inside', '/ /evil.com'],
        ['backslash host', '\\\\evil.com'],
        ['single backslash', '\\evil.com'],
        ['colon in first segment', 'foo:bar/baz'],
    ])('rejects %s', (_name, input) => {
        expect(safeHref(input)).toBeNull();
    });

    it('rejects a slash followed by a backslash (browsers read it as //host)', () => {
        expect(safeHref('/\\evil.com')).toBeNull();
    });
});

describe('safeImageSrc', () => {
    it.each([
        ['https://cdn.example.com/a.png', 'https://cdn.example.com/a.png'],
        ['http://example.com/a.png', 'http://example.com/a.png'],
        ['/storage/uploads/a.png', '/storage/uploads/a.png'],
        ['uploads/a.png', 'uploads/a.png'],
        ['  /storage/a.png ', '/storage/a.png'],
    ])('accepts %j', (input, expected) => {
        expect(safeImageSrc(input)).toBe(expected);
    });

    it.each([
        ['mailto', 'mailto:a@example.com'],
        ['tel', 'tel:+639171234567'],
        ['javascript', 'javascript:alert(1)'],
        ['smuggled javascript', 'jav\nascript:alert(1)'],
        ['data image', 'data:image/png;base64,AAAA'],
        ['svg data', 'data:image/svg+xml,<svg onload=alert(1)>'],
        ['protocol relative', '//cdn.example.com/a.png'],
        ['backslash', '\\\\cdn.example.com\\a.png'],
        ['empty', ''],
        ['non-string', 5],
    ])('rejects %s', (_name, input) => {
        expect(safeImageSrc(input)).toBeNull();
    });
});

describe('isExternalHref', () => {
    it.each([
        ['https://example.com', true],
        ['http://example.com', true],
        ['HTTP://EXAMPLE.COM', true],
        ['/about', false],
        ['#top', false],
        ['//example.com', false],
        ['mailto:info@example.com', false],
        ['tel:+63', false],
        ['httpsx://example.com', false],
        ['relative/path', false],
    ])('%j → %s', (input, expected) => {
        expect(isExternalHref(input)).toBe(expected);
    });
});

describe('parseVideoUrl', () => {
    const ID = 'dQw4w9WgXcQ';
    const youtube = { provider: 'youtube', id: ID, embedUrl: `https://www.youtube-nocookie.com/embed/${ID}` };

    it.each([
        [`https://www.youtube.com/watch?v=${ID}`],
        [`https://youtube.com/watch?v=${ID}&list=PL123`],
        [`https://m.youtube.com/watch?v=${ID}`],
        [`https://WWW.YOUTUBE.COM/watch?v=${ID}`],
        [`  https://www.youtube.com/watch?v=${ID}  `],
        [`https://youtu.be/${ID}`],
        [`https://youtu.be/${ID}?t=30`],
        [`http://youtu.be/${ID}`],
        [`https://www.youtube.com/embed/${ID}`],
        [`https://www.youtube.com/shorts/${ID}`],
        [`https://www.youtube.com/live/${ID}`],
        [`https://www.youtube-nocookie.com/embed/${ID}`],
    ])('accepts YouTube %j', (url) => {
        expect(parseVideoUrl(url)).toEqual(youtube);
    });

    it.each([
        ['https://vimeo.com/123456789'],
        ['https://www.vimeo.com/123456789'],
        ['https://player.vimeo.com/video/123456789'],
        ['https://vimeo.com/123456789?share=copy'],
    ])('accepts Vimeo %j', (url) => {
        expect(parseVideoUrl(url)).toEqual({
            provider: 'vimeo',
            id: '123456789',
            embedUrl: 'https://player.vimeo.com/video/123456789?dnt=1',
        });
    });

    it.each([
        ['evil host', `https://evil.com/watch?v=${ID}`],
        ['lookalike subdomain', 'https://youtube.com.evil.com/watch?v=aaaaaaaaaaa'],
        ['lookalike youtu.be', `https://youtu.be.evil.com/${ID}`],
        ['userinfo trick', `https://youtube.com@evil.com/watch?v=${ID}`],
        ['url inside path', `https://evil.com/https://youtu.be/${ID}`],
        ['short id', 'https://youtu.be/short'],
        ['long id', `https://youtu.be/${ID}0`],
        ['id with bad characters', 'https://youtu.be/dQw4w9WgXc!'],
        ['id with injection', 'https://www.youtube.com/watch?v=dQw4w9WgXc"onload=1'],
        ['watch without v', 'https://www.youtube.com/watch'],
        ['channel page', 'https://www.youtube.com/channel/UCxxxxxxxxxxx'],
        ['non-http scheme', `ftp://youtu.be/${ID}`],
        ['javascript', 'javascript:alert(1)'],
        ['data', 'data:text/html,<iframe>'],
        ['not a url', 'not a url'],
        ['empty', ''],
        ['vimeo letters', 'https://vimeo.com/abcdefgh'],
        ['vimeo too short', 'https://vimeo.com/1234'],
        ['vimeo player without /video', 'https://player.vimeo.com/123456789'],
        ['vimeo lookalike', 'https://vimeo.com.evil.com/123456789'],
        ['non-string', 42],
        ['null', null],
    ])('rejects %s', (_name, url) => {
        expect(parseVideoUrl(url)).toBeNull();
    });
});
