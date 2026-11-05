/**
 * The public site's navigation: turns the stored Navigation links and the Departments into the header and
 * footer items, and owns the default menu (the header fallback and the admin's "Use the default menu").
 * Pure, no `astro:*`.
 */
import type { NavLinkView } from './content-types';

export interface NavItem {
    label: string;
    href?: string;
    children?: { label: string; href: string }[];
}

export interface FooterLink {
    label: string;
    href: string;
}

/** Link URL that the header turns into a dropdown of every Department (also the home page section id). */
export const DEPARTMENTS_MENU_URL = '#departments';

/** The links "Use the default menu" creates, in order; the header shows the same menu while none are stored. */
export const DEFAULT_NAV_LINKS: { label: string; url: string }[] = [
    { label: 'Home', url: '/' },
    { label: 'Departments', url: DEPARTMENTS_MENU_URL },
    { label: 'News & Events', url: '/posts' },
    { label: 'Downloads', url: '/downloads' },
    { label: 'Contact', url: '/contact' },
];

/** Pages that belong in the sitemap. */
export const SITEMAP_PAGES = ['/', '/posts', '/downloads', '/contact'];

/** Internal paths that exist besides Departments and Posts (valid link targets). */
export const STATIC_PATHS = [...SITEMAP_PAGES, '/login', '/rss.xml', '/sitemap.xml'];

/** Public page of a Department. */
export function departmentHref(slug: string): string {
    return `/departments/${slug}`;
}

/** Header items: stored links when any exist, otherwise the default menu. */
export function headerItems(navLinks: NavLinkView[], departments: { name: string; slug: string }[]): NavItem[] {
    const departmentLinks = departments.map((d) => ({ label: d.name, href: departmentHref(d.slug) }));

    if (navLinks.length > 0) {
        return navLinks.map((link) =>
            link.url === DEPARTMENTS_MENU_URL
                ? { label: link.label, children: departmentLinks }
                : link.children.length > 0
                  ? { label: link.label, children: link.children.map((c) => ({ label: c.label, href: c.url })) }
                  : { label: link.label, href: link.url },
        );
    }
    return DEFAULT_NAV_LINKS.flatMap((link): NavItem[] =>
        link.url !== DEPARTMENTS_MENU_URL
            ? [{ label: link.label, href: link.url }]
            : departmentLinks.length > 0
              ? [{ label: link.label, children: departmentLinks }]
              : [],
    );
}

/** Footer columns: every Department (a link to the home page section while there are none) and the quick links. */
export function footerItems(departments: { name: string; slug: string }[]): {
    departments: FooterLink[];
    quickLinks: FooterLink[];
} {
    return {
        departments:
            departments.length > 0
                ? departments.map((d) => ({ label: d.name, href: departmentHref(d.slug) }))
                : [{ label: 'Academic programs', href: `/${DEPARTMENTS_MENU_URL}` }],
        quickLinks: [
            { label: 'News & Events', href: '/posts' },
            { label: 'Downloads', href: '/downloads' },
            { label: 'Contact & Admissions', href: '/contact' },
            { label: 'RSS feed', href: '/rss.xml' },
        ],
    };
}
