import type { CarouselItem } from '@/generated/prisma/client';
import type { Layer, SlideMobile } from '@/lib/carousel-overlay';
import type { SlideVideoView } from '@/lib/content-types';
import { parseVideoUrl } from '../blocks/urls';
import { parseOverlay, parseOverlayDocument } from '../carousel-overlay-schema';
import { db } from './db';
import { headUpload, keyFromPublicUrl, publicUrl, videoKeyFromUrl } from './storage';
import { commitWithFiles, deleteWithFiles } from './stored-files';

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
    /** null = legacy slide (title / subtitle / link only), converted to layers on first edit. */
    overlay: Layer[] | null;
    /** Slide-level phone settings (photo focal point); null = centred. */
    mobile: SlideMobile | null;
    /** Public URL of the uploaded background video, or the YouTube link; '' = none. */
    video: string;
    videoKind: 'file' | 'youtube' | null;
}

export function toDesignerSlide(row: CarouselItem): DesignerSlide {
    const doc = parseOverlayDocument(row.overlay);
    return {
        id: row.id,
        imageUrl: publicUrl(row.imagePath) ?? '',
        title: row.title,
        subtitle: row.subtitle,
        linkUrl: row.linkUrl,
        order: row.order,
        departmentId: row.departmentId,
        showOnMain: row.showOnMain,
        overlay: doc?.layers ?? null,
        mobile: doc?.mobile ?? null,
        video: row.videoPath ? (publicUrl(row.videoPath) ?? '') : (row.videoUrl ?? ''),
        videoKind: row.videoPath ? 'file' : row.videoUrl ? 'youtube' : null,
    };
}

/** The two video columns of a slide: an uploaded file the row owns, or a YouTube link; at most one is set. */
export interface SlideVideo {
    videoPath: string | null;
    videoUrl: string | null;
}

export type SlideVideoResult = { ok: true; video: SlideVideo } | { ok: false; error: string };

/**
 * Parses the designer's single `video` field: '' = none, one of our uploaded videos (`videos/…`) = `videoPath`,
 * a YouTube link = `videoUrl` (stored in its canonical watch form). Anything else is rejected.
 */
export function parseSlideVideo(input: string): SlideVideoResult {
    const value = input.trim();
    if (!value) return { ok: true, video: { videoPath: null, videoUrl: null } };
    const key = videoKeyFromUrl(value);
    if (key) return { ok: true, video: { videoPath: key, videoUrl: null } };
    const source = parseVideoUrl(value);
    if (source?.provider === 'youtube') {
        return { ok: true, video: { videoPath: null, videoUrl: `https://www.youtube.com/watch?v=${source.id}` } };
    }
    return { ok: false, error: 'Use a YouTube link or upload an mp4 or webm video.' };
}

/**
 * True when a stored video is referenced by something other than slide `exceptId`: another slide, post or hero
 * content, or a setting. A slide may only adopt a video nothing else uses, so replacing or deleting its video
 * can never remove another row's file.
 */
export async function videoUsedElsewhere(key: string, exceptId?: number): Promise<boolean> {
    const [slides, posts, heroes, settings] = await Promise.all([
        db.carouselItem.count({
            where: { videoPath: key, ...(exceptId === undefined ? {} : { id: { not: exceptId } }) },
        }),
        db.post.count({ where: { content: { contains: key } } }),
        db.heroSection.count({ where: { content: { contains: key } } }),
        db.setting.count({ where: { value: { contains: key } } }),
    ]);
    return slides + posts + heroes + settings > 0;
}

/** How the public carousel plays a slide's background video: our file (by extension) or a YouTube id; null for none. */
export function slideVideoView(row: { videoPath: string | null; videoUrl: string | null }): SlideVideoView | null {
    if (row.videoPath) {
        const src = publicUrl(row.videoPath);
        return src ? { kind: 'file', src, mime: row.videoPath.endsWith('.webm') ? 'video/webm' : 'video/mp4' } : null;
    }
    const source = row.videoUrl ? parseVideoUrl(row.videoUrl) : null;
    return source?.provider === 'youtube' ? { kind: 'youtube', id: source.id } : null;
}

/** Error message when `key` cannot become the video of slide `slideId` (a new slide has no id), else null. */
export async function videoClaimError(key: string, slideId?: number): Promise<string | null> {
    if (!(await headUpload(key))) return 'The uploaded video was not found. Upload it again.';
    if (await videoUsedElsewhere(key, slideId))
        return 'This video is already used elsewhere. Upload it again for this slide.';
    return null;
}

/** The legacy-compatible columns derived from a designer document (see `legacyFields`). */
export interface SlideContent {
    overlay: string | null;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
}

/**
 * Saves a slide's design, replacement photo and video in one commit. The video file belongs to the row:
 * a newly adopted upload is removed if the commit fails, the old file is removed after a replace or removal.
 * `video` undefined keeps the current one.
 */
export async function updateSlide(
    row: CarouselItem,
    input: { content: SlideContent; image?: File; video?: SlideVideo },
): Promise<CarouselItem> {
    const video = input.video ?? { videoPath: row.videoPath, videoUrl: row.videoUrl };
    const videoChanged = video.videoPath !== row.videoPath;
    const kept = overlayImageSrcs(input.content.overlay);
    const droppedSrcs = overlayImageSrcs(row.overlay).filter((src) => !kept.includes(src));
    return commitWithFiles({
        files: { image: input.image && { prefix: 'carousels', file: input.image } },
        adopted: videoChanged ? [video.videoPath] : [],
        run: ({ image }) =>
            db.carouselItem.update({
                where: { id: row.id },
                data: { ...input.content, imagePath: image ?? row.imagePath, ...video },
            }),
        stale: async () => [
            input.image ? row.imagePath : null,
            videoChanged ? row.videoPath : null,
            ...(await unusedLayerImageKeys(droppedSrcs)),
        ],
    });
}

/** Deletes a slide and every file it owned: photo, uploaded video and layer images nothing else uses. */
export function deleteSlide(row: CarouselItem): Promise<{ id: number }> {
    return deleteWithFiles(
        async () => {
            await db.carouselItem.delete({ where: { id: row.id } });
            return { id: row.id };
        },
        async () => [row.imagePath, row.videoPath, ...(await unusedLayerImageKeys(overlayImageSrcs(row.overlay)))],
    );
}

/** Image URLs referenced by the image layers of a stored overlay. */
export function overlayImageSrcs(raw: string | null | undefined): string[] {
    const layers = parseOverlay(raw) ?? [];
    return [...new Set(layers.flatMap((layer) => (layer.type === 'image' ? [layer.src] : [])))];
}

/** Storage key of a layer image uploaded under `carousels/`; null for anything else (never delete foreign files). */
export function ownedImageKey(src: string): string | null {
    const key = keyFromPublicUrl(src);
    return key && /^carousels\/[A-Za-z0-9._-]+$/.test(key) ? key : null;
}

/**
 * Keys of the given layer images that no slide references any more (as layer or as slide photo).
 * Call after the row that referenced them was updated or deleted; pass the result to the stored-files cleanup.
 */
export async function unusedLayerImageKeys(srcs: string[]): Promise<string[]> {
    const unused: string[] = [];
    for (const src of srcs) {
        const key = ownedImageKey(src);
        if (!key) continue;
        const used = await db.carouselItem.count({
            where: { OR: [{ overlay: { contains: src } }, { imagePath: key }] },
        });
        if (used === 0) unused.push(key);
    }
    return unused;
}
