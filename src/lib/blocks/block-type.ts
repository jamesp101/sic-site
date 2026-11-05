/**
 * The contract of one Block type. Every Block type is a module in `block-types/` that implements
 * `BlockTypeModule` and is listed once in `registry.ts`, whose type makes the compiler reject a Block type
 * without a module. Pure TypeScript: no Svelte, no DOM (the editor's icon and Inspector panel live in the
 * client registry, `components/admin/editor/block-editors.ts`, keyed by the same type).
 */
import type { z } from 'zod';
import type { Block, BlockMeta, BlockType, PropsByType } from './types';

/** Reports a cross-field problem on a prop (`path` = the prop's path, e.g. `['images', 1, 'alt']`). */
export type Report = (message: string, path?: (string | number)[]) => void;

/** What a Block type's `html` needs from the renderer. */
export interface RenderContext {
    /** Admin canvas: adds editor hooks and placeholders. */
    editor: boolean;
    /** The `data-block-*` attributes of the canvas (leading space included), `''` on the public site. */
    hooks(block: Block, empty?: boolean): string;
    /** Renders child blocks in this context. */
    children(children: Block[] | undefined): string;
}

/** Stored JSON of unknown shape, as seen by plain-text extraction. */
export type Json = Record<string, unknown>;

/** A prop that can be edited directly on the canvas. */
export interface InlineEditing {
    /** The prop the edited text is written to. */
    field: string;
    kind: 'plain' | 'rich';
    /** CSS selector of the element to edit inside the block's element; the block element itself when absent. */
    target?: string;
}

export interface BlockTypeModule<T extends BlockType> {
    /** Palette label, group and description. */
    meta: BlockMeta;
    /** Holds child blocks. */
    container?: true;
    /** Can only be placed at the top level of a document. */
    rootOnly?: true;
    /** Props of a freshly created block. */
    defaults(): PropsByType[T];
    /** Shape of the props: whitelisted values, limits, defaults for missing props. */
    schema: z.ZodType;
    /** Cross-field rules that need more than a shape check; run on schema-normalised props. */
    rules?(props: PropsByType[T], report: Report): void;
    /** Public HTML (or the canvas HTML when `ctx.editor`); every string escaped, every URL filtered. */
    html(block: Block<T>, ctx: RenderContext): string;
    /** Readable texts for search and excerpts, from stored props of unknown shape. Tolerates anything. */
    text(props: Json): string[];
    inline?: InlineEditing;
}
