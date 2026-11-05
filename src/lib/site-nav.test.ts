import { describe, expect, it } from 'vite-plus/test';
import type { NavLinkView } from './content-types';
import {
    DEFAULT_NAV_LINKS,
    DEPARTMENTS_MENU_URL,
    SITEMAP_PAGES,
    STATIC_PATHS,
    departmentHref,
    footerItems,
    headerItems,
} from './site-nav';

const departments = [
    { name: 'CIT', slug: 'cit' },
    { name: 'CBA', slug: 'cba' },
];
const link = (id: number, label: string, url: string, children: NavLinkView[] = []): NavLinkView => ({
    id,
    label,
    url,
    children,
});

describe('headerItems', () => {
    it('falls back to the default menu while no links are stored', () => {
        const items = headerItems([], departments);
        expect(items.map((item) => item.label)).toEqual(DEFAULT_NAV_LINKS.map((l) => l.label));
        expect(items[1]).toEqual({
            label: 'Departments',
            children: [
                { label: 'CIT', href: '/departments/cit' },
                { label: 'CBA', href: '/departments/cba' },
            ],
        });
        expect(items[0]).toEqual({ label: 'Home', href: '/' });
    });

    it('leaves the Departments menu out of the default menu when there are no Departments', () => {
        expect(headerItems([], []).map((item) => item.label)).toEqual([
            'Home',
            'News & Events',
            'Downloads',
            'Contact',
        ]);
    });

    it('turns the Departments-menu link into a dropdown of every Department, ignoring its own children', () => {
        const items = headerItems([link(1, 'Schools', DEPARTMENTS_MENU_URL, [link(2, 'x', '/x')])], departments);
        expect(items).toEqual([
            {
                label: 'Schools',
                children: [
                    { label: 'CIT', href: '/departments/cit' },
                    { label: 'CBA', href: '/departments/cba' },
                ],
            },
        ]);
    });

    it('maps parents with sub-links to dropdowns and the rest to plain links', () => {
        const items = headerItems(
            [link(1, 'About', '/about', [link(2, 'Team', '/team')]), link(3, 'Contact', '/contact')],
            [],
        );
        expect(items).toEqual([
            { label: 'About', children: [{ label: 'Team', href: '/team' }] },
            { label: 'Contact', href: '/contact' },
        ]);
    });
});

describe('footerItems', () => {
    it('lists every Department and the quick links', () => {
        const footer = footerItems(departments);
        expect(footer.departments).toEqual([
            { label: 'CIT', href: '/departments/cit' },
            { label: 'CBA', href: '/departments/cba' },
        ]);
        expect(footer.quickLinks.map((l) => l.href)).toEqual(['/posts', '/downloads', '/contact', '/rss.xml']);
    });

    it('points at the home page Departments section while there are no Departments', () => {
        expect(footerItems([]).departments).toEqual([{ label: 'Academic programs', href: '/#departments' }]);
    });
});

describe('paths', () => {
    it('builds the Department href once and keeps the sitemap pages valid link targets', () => {
        expect(departmentHref('cit')).toBe('/departments/cit');
        for (const path of SITEMAP_PAGES) expect(STATIC_PATHS).toContain(path);
    });
});
