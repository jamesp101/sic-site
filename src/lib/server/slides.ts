/**
 * The Slide read model: stored carousel rows as the public Carousel and the admin designer see them. Both go
 * through `slideDocument` (a legacy slide arrives as Layers) and the one video rule, `slideVideoView`.
 */
import type { CarouselItem, Prisma } from '@/generated/prisma/client';
import type { CarouselSlide, SlideVideoView } from '@/lib/content-types';
import { parseVideoUrl } from '@/lib/blocks/urls';
import type { Layer, SlideMobile } from '@/lib/carousel-overlay';
import { slideDocument } from '@/lib/carousel-overlay-schema';
import { db } from './db';
import { publicUrl, variantUrl } from './storage';
import { SLIDE_WIDTH } from './storage/variants';

/** Canonical watch URL a YouTube slide video is stored under. */
export function youtubeWatchUrl(id: string): string {
    return `https://www.youtube.com/watch?v=${id}`;
}

/** How a slide's background video plays: our file (by extension) or a YouTube id; null for none. */
export function slideVideoView(row: { videoPath: string | null; videoUrl: string | null }): SlideVideoView | null {
    if (row.videoPath) {
        const src = publicUrl(row.videoPath);
        return src ? { kind: 'file', src, mime: row.videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4' } : null;
    }
    const source = row.videoUrl ? parseVideoUrl(row.videoUrl) : null;
    return source?.provider === 'youtube' ? { kind: 'youtube', id: source.id } : null;
}

const slideSelect = {
    id: true,
    imagePath: true,
    overlay: true,
    title: true,
    subtitle: true,
    linkUrl: true,
    videoPath: true,
    videoUrl: true,
} satisfies Prisma.CarouselItemSelect;

/** The public Carousel's Slides matching `where`, in sequence order. */
export async function findSlides(where: Prisma.CarouselItemWhereInput): Promise<CarouselSlide[]> {
    const rows = await db.carouselItem.findMany({
        where,
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: slideSelect,
    });
    return rows.map((row) => {
        const doc = slideDocument(row);
        return {
            id: row.id,
            imageUrl: publicUrl(row.imagePath) ?? row.imagePath,
            imageMediumUrl: variantUrl(row.imagePath, SLIDE_WIDTH),
            layers: doc.layers,
            mobile: doc.mobile,
            video: slideVideoView(row),
        };
    });
}

/** Slide as the admin designer sees it. */
export interface DesignerSlide {
    id: number;
    imageUrl: string;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
    order: number;
    departmentId: number | null;
    showOnMain: boolean;
    /** A legacy slide (title / subtitle / link only) arrives already converted to layers. */
    layers: Layer[];
    /** Slide-level phone settings (photo focal point); null = centred. */
    mobile: SlideMobile | null;
    /** Public URL of the uploaded background video, or the YouTube link; '' = none. */
    video: string;
    videoKind: 'file' | 'youtube' | null;
}

export function toDesignerSlide(row: CarouselItem): DesignerSlide {
    const doc = slideDocument(row);
    const video = slideVideoView(row);
    return {
        id: row.id,
        imageUrl: publicUrl(row.imagePath) ?? '',
        title: row.title,
        subtitle: row.subtitle,
        linkUrl: row.linkUrl,
        order: row.order,
        departmentId: row.departmentId,
        showOnMain: row.showOnMain,
        layers: doc.layers,
        mobile: doc.mobile,
        video: video ? (video.kind === 'file' ? video.src : youtubeWatchUrl(video.id)) : '',
        videoKind: video?.kind ?? null,
    };
}
