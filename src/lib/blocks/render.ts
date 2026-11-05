/**
 * Block document → semantic HTML. Pure TypeScript (no astro imports): runs during SSR, in tests and inside
 * the admin canvas, so the editor shows exactly what visitors get. Every string is escaped, every URL is
 * filtered, every colour is a design token and headings are clamped to h2–h4 (the page owns its single h1).
 * Each Block type renders itself (`html` of its module in `block-types/`); this file walks the tree.
 */
import type { RenderContext } from './block-type';
import { BLOCK_REGISTRY, isBlockType, blockModule } from './registry';
import { esc } from './render-kit';
import type { Block } from './types';

export interface RenderOptions {
    /** Adds `data-block-*` hooks, drop-target hints and video placeholders for the admin canvas. */
    editor?: boolean;
}

function renderBlock(block: Block, ctx: RenderContext): string {
    if (!isBlockType(block.type)) return '';
    const html = blockModule(block.type).html(block as never, ctx);
    if (html || !ctx.editor) return html;
    // Blocks that render nothing publicly (e.g. an empty heading) still need a canvas element so they can be selected.
    return `<div class="rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground"${ctx.hooks(block)}>Empty ${esc(BLOCK_REGISTRY[block.type].meta.label.toLowerCase())}. Fill it in using the inspector.</div>`;
}

function contextFor(editor: boolean): RenderContext {
    const ctx: RenderContext = {
        editor,
        hooks(block, empty = false) {
            if (!editor) return '';
            const { label } = BLOCK_REGISTRY[block.type].meta;
            return ` data-block-id="${esc(block.id)}" data-block-type="${block.type}" data-block-label="${esc(label)}"${empty ? ' data-empty="true"' : ''}`;
        },
        children: (children) => (children ?? []).map((child) => renderBlock(child, ctx)).join(''),
    };
    return ctx;
}

/** Renders a list of blocks inside the standard vertical flow wrapper. Returns `''` when nothing renders. */
export function renderBlocks(blocks: Block[], options: RenderOptions = {}): string {
    const ctx = contextFor(options.editor === true);
    const inner = ctx.children(blocks);
    return inner ? `<div class="flex flex-col gap-5" data-sic-blocks>${inner}</div>` : '';
}
