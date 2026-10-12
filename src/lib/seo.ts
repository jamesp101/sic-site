import type { DepartmentDetail, MemberNode, PostDetail, PostSummary } from '@/lib/content-types';
import { SITE } from '@/lib/site';

type JsonLd = Record<string, unknown>;
type Site = URL | string;

export interface Crumb {
    label: string;
    href?: string;
}

/** Absolute URL for a site-relative path (or pass-through for absolute URLs). */
export function absoluteUrl(path: string, site: Site): string {
    return new URL(path, site).href;
}

const orgId = (site: Site) => `${absoluteUrl('/', site)}#organization`;

const postalAddress = () => ({ '@type': 'PostalAddress', ...SITE.address });

/** The college itself; used on the home page and referenced elsewhere via @id. */
export function collegeOrganization(site: Site): JsonLd {
    return {
        '@context': 'https://schema.org',
        '@type': 'CollegeOrUniversity',
        '@id': orgId(site),
        name: SITE.name,
        alternateName: SITE.shortName,
        url: absoluteUrl('/', site),
        logo: { '@type': 'ImageObject', url: absoluteUrl(SITE.logo, site) },
        image: absoluteUrl(SITE.defaultOgImage, site),
        description: SITE.description,
        address: postalAddress(),
        telephone: SITE.telephoneE164,
        email: SITE.email,
        foundingDate: SITE.foundingDate,
        founder: { '@type': 'Person', name: SITE.founder },
        sameAs: [...SITE.sameAs],
    };
}

export function webSite(site: Site): JsonLd {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${absoluteUrl('/', site)}#website`,
        url: absoluteUrl('/', site),
        name: SITE.name,
        inLanguage: 'en-PH',
        publisher: { '@id': orgId(site) },
        potentialAction: {
            '@type': 'SearchAction',
            target: {
                '@type': 'EntryPoint',
                urlTemplate: `${absoluteUrl('/posts', site)}?search={search_term_string}`,
            },
            'query-input': 'required name=search_term_string',
        },
    };
}

/** `current` is the absolute URL used for the final crumb when it has no href. */
export function breadcrumbList(crumbs: Crumb[], site: Site, current: string): JsonLd {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.label,
            item: crumb.href ? absoluteUrl(crumb.href, site) : current,
        })),
    };
}

export function postsItemList(posts: PostSummary[], site: Site, name: string): JsonLd {
    return {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name,
        numberOfItems: posts.length,
        itemListElement: posts.map((post, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            url: absoluteUrl(`/posts/${post.slug}`, site),
            name: post.title,
        })),
    };
}

/** Event for event posts that have a start date; NewsArticle otherwise. */
export function postJsonLd(post: PostDetail, site: Site, canonical: string): JsonLd {
    const image = post.imageUrl ? [absoluteUrl(post.imageUrl, site)] : undefined;

    if (post.type === 'event' && post.startDate) {
        return {
            '@context': 'https://schema.org',
            '@type': 'Event',
            name: post.title,
            description: post.excerpt,
            url: canonical,
            startDate: post.startDate.toISOString(),
            ...(post.endDate ? { endDate: post.endDate.toISOString() } : {}),
            eventStatus: 'https://schema.org/EventScheduled',
            eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
            location: { '@type': 'Place', name: SITE.name, address: postalAddress() },
            organizer: { '@id': orgId(site) },
            ...(image ? { image } : {}),
        };
    }

    return {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: post.title.length > 110 ? `${post.title.slice(0, 107).trimEnd()}…` : post.title,
        description: post.excerpt,
        ...(image ? { image } : {}),
        datePublished: post.createdAt.toISOString(),
        dateModified: post.updatedAt.toISOString(),
        articleSection: post.type === 'announcement' ? 'Announcements' : 'News',
        inLanguage: 'en-PH',
        author: { '@type': 'Person', name: post.authorName },
        publisher: {
            '@type': 'Organization',
            '@id': orgId(site),
            name: SITE.name,
            logo: { '@type': 'ImageObject', url: absoluteUrl(SITE.logo, site) },
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    };
}

function flattenMembers(nodes: MemberNode[]): MemberNode[] {
    return nodes.flatMap((node) => [node, ...flattenMembers(node.children)]);
}

/** A department as a sub-organisation of the college, with its staff as Person entries. */
export function departmentJsonLd(
    department: DepartmentDetail,
    members: MemberNode[],
    site: Site,
    canonical: string,
): JsonLd {
    const people = flattenMembers(members).map((member) => ({
        '@type': 'Person',
        name: member.name,
        jobTitle: member.role,
        ...(member.imageUrl ? { image: absoluteUrl(member.imageUrl, site) } : {}),
    }));

    return {
        '@context': 'https://schema.org',
        '@type': 'CollegeOrUniversity',
        '@id': `${canonical}#department`,
        name: department.name,
        url: canonical,
        ...(department.description ? { description: department.description } : {}),
        ...(department.logoUrl ? { logo: absoluteUrl(department.logoUrl, site) } : {}),
        parentOrganization: { '@id': orgId(site), '@type': 'CollegeOrUniversity', name: SITE.name },
        address: postalAddress(),
        ...(people.length ? { employee: people } : {}),
    };
}

/** Collapses whitespace so descriptions are always one clean line. */
export function oneLine(text: string | null | undefined, max = 160): string {
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
