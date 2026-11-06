# Rich content and the block editor

Rich content is the Post body, hero sections, the Welcome hero (`src/lib/server/welcome-hero.ts` owns its Setting key, read and write) and department `hero_content`. It is a JSON block document (`{"type":"sic-blocks","version":1,…}`, `src/lib/blocks/`) or Markdown. Department `hero_content` is edited as Markdown.

## One entry point

- Classification happens once, in `@/lib/blocks/content`: `parseContent` → `html()`, `text()`, `excerpt()`, `check()`. Wrappers: `renderContent`, `toPlainText`, `excerptOf`, `checkContent`. `editableBlocks` turns stored content into the editor's blocks.
- Each renderer marks its own output: block HTML is wrapped in `data-sic-blocks`, Markdown HTML in `data-sic-markdown` (its `<Center>` column carries `data-sic-center`). `app.css` keys the reading measure on these markers, so a page never tells the formats apart; do not add format attributes in pages. A source with nothing readable (blank, or only `import` lines) renders to `""`, never an empty wrapper, so `parseContent` html and text agree; the Markdown block then shows the editor hint only in the editor.
- Anything opening with `{"type":"sic-blocks"` is a block document. A broken one renders empty and is rejected on save.
- Call the Markdown or block renderers only through that module. The exception is the editors' live previews (`BlockEditor` canvas with `renderBlocks`, `MarkdownEditor` preview with `parseMarkdown`): they render the in-memory draft, not stored content.
- Validate on save with `contentField()` (`@/lib/server/content-field`).
- `MarkdownEditor` (CodeMirror) is imported lazily by `DepartmentForm`.

## Search text

Search uses the plain-text `search_text` columns of `posts` and `hero_sections`, never the raw `content` JSON. Every writer sets `searchText: searchTextOf(content)` (`@/lib/blocks/content`); `vp run db:backfill-search` recomputes all rows. Post cards and lists never parse `content`: the Excerpt is `clampExcerpt(searchText)`, and `toPostSummaries` (`queries.ts`) loads `content` only for rows whose `searchText` is empty.

## Block types

A Block type is one module in `src/lib/blocks/block-types/` (defaults, props schema, rules, HTML, plain text, palette meta, inline-editable fields), registered in `src/lib/blocks/registry.ts`, plus its icon and Inspector panel in `components/admin/editor/block-editors.ts` (`inspector/panels/`). Both registries are compile-checked against `PropsByType`; `registry.test.ts` runs every registered type through defaults, hostile-string escaping and plain-text checks. Keep per-type logic in the registries, with no per-type switch elsewhere.

Media blocks:

- `image`: an upload or a pasted image URL (`safeImageSrc`) and an optional `link` (`safeHref`; external links get `target="_blank" rel="noopener noreferrer"` and a screen-reader hint; a linked image needs alt text).
- `album`: at most `LIMITS.albumImages` images, alt required per image. It renders plain links to the full images with the `data-album` hook; `src/scripts/lightbox.ts` (native modal `<dialog>`, Esc/arrows/swipe, "n of m", focus return) upgrades them. The lightbox is a vanilla script, not an island, loaded only by `components/site/AlbumLightbox.astro`. Every public renderer of block content (`MarkdownSection`, the post page) mounts it when `hasAlbum(html)`; a new public page that outputs block HTML does the same.
- `video`: YouTube/Vimeo (iframes) or our own uploaded files (`parseVideoUrl` provider `file`: only the app route `/storage/videos/<32 hex>.mp4|webm`, which redirects to the bucket when `S3_PUBLIC_URL` is set). Rendered as `<video controls preload="metadata" playsinline>`. Upload flow: `storage-images.md`.

## Editor tree and session

- Tree rules live in `src/lib/blocks/edit.ts`: `resolveDrop` for every palette/canvas/Layers drop, `canDrop`, indent/outdent, delete, convert Markdown.
- The editing session is `EditorSession` in `components/admin/editor/session.ts`: blocks, `History`, a selection that never dangles, the emitted value, the Layers `revision`.
- `BlockEditor.svelte` applies edits only through the session (`session.apply(edit)`, `setProps`, `undo`, `redo`, `select`); it never mutates blocks, history or selection itself.
- The one columns-stack literal is in `document.ts` (`updateBlock` keeps one stack per column).
- Keyboard shortcuts are one table in `components/admin/editor/keymap.ts` (`SHORTCUTS`: chords, label, command, when it applies). `resolveKey(event, context)` gives the command of the first matching shortcut that applies; `BlockEditor.handleKey` only runs it. Modifiers match exactly (a chord that omits one needs it up; `mod` = Ctrl or Cmd; `shift: 'any'` ignores Shift), so Ctrl+Backspace or Shift+Delete are not Delete. The shortcuts dialog (`displayKeys`) and the toolbar `aria-keyshortcuts` (`ariaKeys`) derive from the same table. Chord mechanics live in `components/admin/shared/keymap-core.ts`, shared with the Slide designer's own table. Add a shortcut there, never in `handleKey`.
