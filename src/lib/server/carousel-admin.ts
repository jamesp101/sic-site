import type { CarouselItem } from '@/generated/prisma/client';
import { serializeOverlay } from '../carousel-overlay';
import { parseVideoUrl } from '../blocks/urls';
import { parseOverlay, parseOverlayDocument } from '../carousel-overlay-schema';
import { db } from './db';
import { youtubeWatchUrl } from './slides';
import { headUpload, keyFromPublicUrl, publicUrl, read, videoKeyFromUrl } from './storage';
import { commitWithFiles, deleteWithFiles, type NewFile, type NewFiles } from './stored-files';

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
        return { ok: true, video: { videoPath: null, videoUrl: youtubeWatchUrl(source.id) } };
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

/** Error message when `key` cannot become the video of slide `slideId` (a new slide has no id), else null. */
async function videoClaimError(key: string, slideId?: number): Promise<string | null> {
    if (!(await headUpload(key))) return 'The uploaded video was not found. Upload it again.';
    if (await videoUsedElsewhere(key, slideId))
        return 'This video is already used elsewhere. Upload it again for this slide.';
    return null;
}

/**
 * Parses the designer's `video` field and checks the slide (`slideId`, none for a new slide) may own that file.
 * A file the slide already owns is not a new claim.
 */
export async function claimSlideVideo(raw: string, slideId?: number): Promise<SlideVideoResult> {
    const parsed = parseSlideVideo(raw);
    if (!parsed.ok || !parsed.video.videoPath) return parsed;
    const { videoPath } = parsed.video;
    const current =
        slideId === undefined
            ? null
            : await db.carouselItem.findUnique({ where: { id: slideId }, select: { videoPath: true } });
    const error = current?.videoPath === videoPath ? null : await videoClaimError(videoPath, slideId);
    return error ? { ok: false, error } : parsed;
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
        files: { image: input.image && { prefix: 'carousels', file: input.image, variant: true } },
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

/** Creates a slide at the end of the sequence; its photo is stored and an adopted video upload becomes the row's. */
export async function createSlide(input: {
    content: SlideContent;
    image: File;
    video: SlideVideo;
    departmentId: number | null;
    showOnMain: boolean;
}): Promise<CarouselItem> {
    const last = await db.carouselItem.aggregate({ _max: { order: true } });
    return commitWithFiles({
        files: { image: { prefix: 'carousels', file: input.image, variant: true } },
        adopted: [input.video.videoPath],
        run: ({ image }) =>
            db.carouselItem.create({
                data: {
                    ...input.content,
                    ...input.video,
                    order: (last._max.order ?? 0) + 1,
                    departmentId: input.departmentId,
                    showOnMain: input.showOnMain,
                    imagePath: image,
                },
            }),
    });
}

/** A copy of a stored object, to be stored under `prefix`; null when the source is missing. */
async function copyOf(key: string, prefix: NewFile['prefix'] = 'carousels', variant = false): Promise<NewFile | null> {
    const stored = await read(key);
    if (!stored) return null;
    const bytes = await new Response(stored.body).arrayBuffer();
    return {
        prefix,
        variant,
        file: new File([bytes], key.slice(key.lastIndexOf('/') + 1), {
            type: stored.contentType ?? 'application/octet-stream',
        }),
    };
}

/**
 * Copies a slide right after the original, shifting later slides down. The copy owns its own files (photo, video and
 * layer images), so deleting either slide never breaks the other; they are removed again if the commit fails.
 */
export async function duplicateSlide(row: CarouselItem): Promise<CarouselItem> {
    const files: NewFiles = {
        image: await copyOf(row.imagePath, 'carousels', true),
        video: row.videoPath ? await copyOf(row.videoPath, 'videos') : null,
    };
    const layerCopies = new Map<string, string>();
    for (const [index, src] of overlayImageSrcs(row.overlay).entries()) {
        const key = ownedImageKey(src);
        if (!key) continue;
        files[`layer${index}`] = await copyOf(key);
        layerCopies.set(src, `layer${index}`);
    }
    const doc = parseOverlayDocument(row.overlay);

    return commitWithFiles({
        files,
        run: async (keys) => {
            const overlay = doc
                ? serializeOverlay(
                      doc.layers.map((layer) => {
                          const copied = layer.type === 'image' ? keys[layerCopies.get(layer.src) ?? ''] : undefined;
                          return layer.type === 'image' && copied
                              ? { ...layer, src: publicUrl(copied) as string }
                              : layer;
                      }),
                      doc.mobile,
                  )
                : row.overlay;
            const [, copy] = await db.$transaction([
                db.carouselItem.updateMany({
                    where: { order: { gt: row.order } },
                    data: { order: { increment: 1 } },
                }),
                db.carouselItem.create({
                    data: {
                        title: row.title,
                        subtitle: row.subtitle,
                        linkUrl: row.linkUrl,
                        overlay,
                        videoPath: keys.video ?? null,
                        videoUrl: row.videoUrl,
                        order: row.order + 1,
                        departmentId: row.departmentId,
                        showOnMain: row.showOnMain,
                        imagePath: keys.image ?? row.imagePath,
                    },
                }),
            ]);
            return copy;
        },
    });
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
