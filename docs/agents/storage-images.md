# Storage, uploads and images

## Storage

- Files go through `src/lib/server/storage` only: `put`, `remove`, `read`, `publicUrl`, `storedUrl`, `downloadUrl`. `storedUrl` sits next to `publicUrl`: it is the public URL of a non-empty stored key and throws on an empty one; use it where the column always holds a key.
- Backend: `STORAGE_DRIVER` = `local` | `s3` (S3 on Vercel; `local` stays available for self-hosting). Rows store bare keys; no hard-coded `/storage/` URLs. Reference a file only by its key or `publicUrl`.
- Both drivers implement `get(key, range)`, and `/storage/*` answers `Range` with 206 / 416 so videos seek; keep that when touching the route.
- Files a row owns are written and removed only through `commitWithFiles` / `deleteWithFiles` (`src/lib/server/stored-files.ts`): new files are removed if the DB commit fails, stale/owned files only after it succeeds, and cleanup failures are logged, never thrown.
- Stored and served types come only from the `src/lib/server/file-types.ts` allowlist: the extension decides, the browser's declared type is ignored, no HTML/SVG uploads. Videos (MP4/WebM, `src/lib/video-types.ts`) are in that allowlist, but only the video upload accepts them: `imageFile` has its own image list and Downloads refuse them (`isVideoUpload`).
- sharp and the S3 driver are loaded on first use (`await import`).

## Images

Every stored image upload is WebP.

- The browser compresses first (`src/lib/image-compress.ts`): WebP, downscaled to a per-use box (`IMAGE_TARGETS`: slide 1920×1080, highlight/content 1600, layer 1200, logo 512, portrait 480). Croppers pass `target` to `ImageField`; other uploaders call `compressImage(file, target)`.
- The server enforces it. A new image input uses `imageFile(maxBytes, target)` (`src/lib/server/image-file.ts`), which only checks the declared type and size during validation (the parsed value is an `ImageUpload`, so a signed-out or failing request decodes nothing). `commitWithFiles` and the image intake (`acceptImage`) then call `storedImage`, which converts inside the box with sharp (`toWebp`, `image-webp.ts`): the real format must be JPEG, PNG, WebP, GIF or AVIF; EXIF orientation applied, no upscaling, animated GIF → animated WebP, all metadata dropped. A fitting WebP without EXIF/XMP is kept as is.
- Downloads are files, not images: never converted.
- Static brand images in `public/` are pre-sized WebP (`sic-seal-96.webp`, `sic-seal.webp`); `sic-seal.png` remains only for the manifest, JSON-LD logo and Open Graph.

### Variants

- Each image kind has its own widths (`src/lib/server/storage/variants.ts`, `image-variant.ts`): Highlight image `posts/<name>` 640 px, Slide photo `carousels/<name>` 960 px, Department logo `departments/<name>` and Member portrait `members/<name>` 128 px. They are WebPs at `<key without ext>.w<width>.webp`, written by `commitWithFiles` with `variant: true`, removed with the original by `removeAll`, and kept and deleted with it by the storage cleanup.
- Pages use them only through `variantUrl(key, width)`: `PostSummary.imageSmallUrl` → `srcset` in `PostCard` and the Post hero; `CarouselSlide.imageMediumUrl` → `srcset` in `HeroCarousel`; `DepartmentSummary.logoSmallUrl` → `DepartmentCard`; `MemberNode.imageSmallUrl` → `OrgChart`.
- `/storage/<variant>` serves the original when the variant is missing, only for variants of these kinds (`originalCandidates` is empty for any other key, so the route never probes the store; a missing key answers 404 with `max-age=60`). A missing variant never breaks a page.
- `vp run storage:variants` creates the missing ones for existing images. Slide photos come from `carousel_items.image_path` (`carousels/` also holds Layer images, which have none); every file under `posts/`, `departments/` and `members/` is a candidate.

## Intake

- Unattached images (block/Markdown content, carousel layers) use the one route `src/pages/api/admin/uploads/image.ts` (`acceptImage`, `image-intake.ts`; `kind` = `content` | `layer`). Clients use `postImage`/`uploadImage` from `components/admin/editor/upload.ts`.
- Download files go through `acceptDownloadFile` (`download-intake.ts`), which takes a multipart file or a direct-upload key. On `s3` the browser uploads through presigned PUT URLs from `src/pages/api/admin/uploads/direct.ts` (server-generated key recorded in `pending_uploads` for the requesting user, signed content type + size), because Vercel rejects request bodies over ~4.5 MB. The intake checks ownership, object existence and size before claiming the pending upload (shared by Downloads and videos: `claimUploadedObject`, `direct-intake.ts`). The bucket needs a CORS rule for PUT from the site origin.
- Videos (`LIMITS.video`, 100 MB) never go through actions. Clients call `uploadVideo(file, onProgress)` (`components/admin/editor/upload.ts`):
    1. POST `{ fileName, contentType, size }` to `src/pages/api/admin/uploads/video.ts` (type and size check, `assertUploadQuota`, server-generated `videos/<random>.<ext>` key in `pending_uploads`);
    2. PUT the bytes: `s3` presigned URL straight to the bucket; `local` the same route's `PUT`, read by hand into a temp file by `receiveUpload`, stopped and removed past the announced size, key owner only. Never cancel the request body: that crashes Node;
    3. POST `{ key }` to `video/complete.ts` (`video-intake.ts`: owner, object, size, then the claim);
    4. store the returned app URL `storageRouteUrl(key)` (`/storage/videos/<key>`, also with `S3_PUBLIC_URL`; the route redirects to the bucket base, which answers `Range`). `videoKeyFromUrl` maps either URL form back to its key.
- Pending-upload expiry deletes only the `pending_uploads` row, never the file (a never-completed key may already be in content). Only the orphan cleanup deletes files.
- Body limits: keep multipart bodies small (`LIMITS.image` is 4 MB on `s3`). `local` takes every other upload multipart through actions, so `security.actionBodySizeLimit` in `astro.config.mjs` (24 MB) must stay above the largest non-video limit in `LIMITS` (`e2e/uploads.spec.ts` checks the 20 MB Download). API routes are not actions, so that limit does not cover videos; `@astrojs/node`'s `bodySizeLimit` applies to them, and `astro.config.mjs` sets it to `VIDEO_MAX_BYTES` + 1 MB.

## Cleanup

`storage-cleanup.ts` (`vp run storage:cleanup [-- --dry-run]`; Vercel Cron `/api/cron/storage-cleanup` with `CRON_SECRET`) reclaims orphans: it deletes files that no String column of any table mentions (found from the Prisma model metadata, so new columns count automatically) once they are older than the 24 h grace, and drops expired pending-upload rows. The same daily run deletes expired `app:` rate-limit rows.
