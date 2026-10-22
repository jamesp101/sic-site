/**
 * View-model shapes returned by src/lib/server/queries.ts and consumed by
 * public components. URLs are already resolved through storage.publicUrl.
 */
import type { Layer as OverlayLayer } from './carousel-overlay';

export type PostType = 'article' | 'event' | 'announcement';
export const POST_TYPES: readonly PostType[] = ['article', 'event', 'announcement'];

export interface NavLinkView {
    id: number;
    label: string;
    url: string;
    children: NavLinkView[];
}

export interface DepartmentRef {
    id: number;
    name: string;
    slug: string;
}

export interface DepartmentSummary extends DepartmentRef {
    description: string | null;
    logoUrl: string | null;
    updatedAt: Date;
}

export interface DepartmentDetail extends DepartmentSummary {
    heroContent: string | null;
}

export interface CarouselSlide {
    id: number;
    title: string | null;
    subtitle: string | null;
    imageUrl: string;
    linkUrl: string | null;
    /** Designer layers; null = legacy slide rendered from title / subtitle / linkUrl. */
    overlay: OverlayLayer[] | null;
}

export interface HeroSectionView {
    id: number;
    title: string | null;
    content: string;
}

export interface PostSummary {
    id: number;
    title: string;
    slug: string;
    type: PostType;
    /** Plain-text excerpt (markdown/MDX-lite stripped), ≤ 200 chars. */
    excerpt: string;
    imageUrl: string | null;
    startDate: Date | null;
    endDate: Date | null;
    isFeatured: boolean;
    createdAt: Date;
    updatedAt: Date;
    department: DepartmentRef | null;
}

export interface PostDetail extends PostSummary {
    content: string;
    authorName: string;
}

export interface MemberNode {
    id: number;
    name: string;
    role: string;
    imageUrl: string | null;
    children: MemberNode[];
}

export type FileKind = 'pdf' | 'doc' | 'sheet' | 'image' | 'archive' | 'other';

export interface DownloadView {
    id: number;
    fileName: string;
    /** Inline URL, e.g. /storage/downloads/abc.pdf */
    url: string;
    /** URL that forces a download with the original file name. */
    downloadUrl: string;
    size: number;
    extension: string;
    kind: FileKind;
    tags: string[];
    directory: string;
    createdAt: Date;
    department: DepartmentRef | null;
}

export interface PostFilters {
    type?: PostType;
    departmentId?: number;
    search?: string;
    sort?: 'newest' | 'oldest';
}

/** One page of a list: `page` is 1-based; `pageCount` is at least 1 even when `total` is 0. */
export interface Paginated<T> {
    items: T[];
    total: number;
    page: number;
    perPage: number;
    pageCount: number;
}

export interface DownloadFilters {
    search?: string;
    departmentId?: number;
    directory?: string;
}
