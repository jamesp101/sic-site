# Carousel slides and the slide designer

## Overlay and Mobile layout

- A Slide may carry `carousel_items.overlay`: JSON `{v:1, layers:[…], mobile?}`, positions in % of the 16:9 slide, token colours and sizes (`src/lib/carousel-overlay*.ts`).
- A Slide without a usable overlay (title/subtitle/link columns) is converted to Layers once, in the Slide read model: `slideDocument` in the schema, read in `src/lib/server/slides.ts` (`findSlides` for the public Carousel, `toDesignerSlide` for the designer, one `slideVideoView` for the file-or-YouTube rule). The public Carousel and the designer render Layers only; there is no second render path.
- Validate with the overlay schema: `parseOverlayStrict` for writes, `parseOverlayDocument`/`parseOverlay` for reads. Layer images live under `carousels/` and are cleaned up on update/delete.
- Mobile layout facts live in `src/lib/carousel-layout.ts`: phone breakpoint, 4:5 frame, hero heights, auto text-colour rule, Layer + box → style, and the hero photo `sizes` (`heroImageSizes(tall)`, from `HERO_PHONE_IMAGE_WIDTH`; `HeroCarousel` uses it for the Slide photo `srcset`). The CSS that must repeat them is `src/styles/slide-layout.css`; `carousel-layout.test.ts` fails when they disagree or a component hard-codes one.
- Phones (< `sm`) show the slide at 4:5. A Layer's optional `mobile` override (`x`,`y`,`w`,`h` in % of the 4:5 frame, `size` token of the phone type scale, `hidden`) and the slide's `mobile.focus` (photo focal point) are optional, so every earlier `{v:1, layers}` document parses and renders unchanged on desktop.
- Layers without a hand-placed `mobile.x/y` are stacked by the pure `resolveMobile` (`carousel-overlay-mobile.ts`: reading order, full width in the margins, sizes one notch down, no overlaps, shrinks to fit). The public carousel and the designer's Mobile view both use it; keep one layout rule.

## Background video

A slide may have a background video: either `carousel_items.video_path` (an uploaded `videos/` key owned by the row) or `video_url` (a YouTube link, played from `youtube-nocookie.com`), never both. The required slide image stays the poster, also under `prefers-reduced-motion` and Save-Data.

- The owned file is replaced, removed and deleted only through `commitWithFiles` `stale` / `deleteWithFiles` (`updateSlide`/`deleteSlide` in `carousel-admin.ts`), and copied on duplicate.
- Actions take one `video` string (`''` = none), parsed by `parseSlideVideo`.
- Upload flow: `storage-images.md`.

## Slide designer

`CarouselDesigner.svelte` renders, keeps focus and toasts, and edits only through `SlideDesignerSession` (`src/lib/slide-designer-session.ts`, free of Svelte/DOM/`astro:*`):

- drafts, open Slide, selected Layer, undo, dirty state (`isDirty`/`anyDirty`);
- Layer commands: `patchSelected` clamps to `LAYER_LIMITS` from `carousel-overlay-schema.ts`; `addLayer`/`duplicateSelected` enforce `MAX_LAYERS`;
- save reconcile and reorder rollback through a `DesignerPort` (the carousel actions, wired in the component).

The component takes Layer limits from the schema and changes drafts only through the session. It uses `UnsavedChangesGuard` (`auth-admin.md`).

Designer keyboard shortcuts are one table in `components/admin/carousels/designer-keymap.ts` (chords, command, when it applies: not while typing, inside the designer area, needs a selected Layer). `resolveDesignerKey(event, context)` gives the command; `onKeydown` only runs it, and the toolbar `aria-keyshortcuts` come from `ariaKeys`. Chord mechanics (exact modifiers, first applicable shortcut, aria/display strings) are shared with the block editor in `components/admin/shared/keymap-core.ts`; the command sets stay separate. Add a shortcut to the table, never to `onKeydown`.
