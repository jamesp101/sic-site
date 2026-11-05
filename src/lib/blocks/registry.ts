/**
 * The Block type registry: one module per Block type (`block-types/`), looked up by validation, rendering,
 * plain-text extraction, the palette and the editor. The mapped type makes the compiler reject a Block type
 * without a module, so adding one to `PropsByType` forces a module and a line here. The editor's icon and
 * Inspector panel are in the client registry (`components/admin/editor/block-editors.ts`), keyed the same way.
 * Key order is the palette order.
 */
import type { BlockTypeModule } from './block-type';
import { accordion } from './block-types/accordion';
import { album } from './block-types/album';
import { badges } from './block-types/badges';
import { button } from './block-types/button';
import { callout } from './block-types/callout';
import { card } from './block-types/card';
import { columns } from './block-types/columns';
import { divider } from './block-types/divider';
import { event } from './block-types/event';
import { grid } from './block-types/grid';
import { heading } from './block-types/heading';
import { image } from './block-types/image';
import { list } from './block-types/list';
import { markdown } from './block-types/markdown';
import { paragraph } from './block-types/paragraph';
import { quote } from './block-types/quote';
import { row } from './block-types/row';
import { section } from './block-types/section';
import { spacer } from './block-types/spacer';
import { stats } from './block-types/stats';
import { table } from './block-types/table';
import { video } from './block-types/video';
import type { BlockType } from './types';

export const BLOCK_REGISTRY: { [T in BlockType]: BlockTypeModule<T> } = {
    section,
    row,
    grid,
    columns,
    spacer,
    divider,
    heading,
    paragraph,
    list,
    quote,
    button,
    badges,
    card,
    image,
    album,
    table,
    accordion,
    callout,
    stats,
    video,
    event,
    markdown,
};

/** Every Block type in palette order. */
export const BLOCK_TYPES = Object.keys(BLOCK_REGISTRY) as [BlockType, ...BlockType[]];

/** Block types that hold child blocks. */
export const CONTAINER_TYPES = BLOCK_TYPES.filter((type) => 'container' in BLOCK_REGISTRY[type]);

export function isBlockType(type: unknown): type is BlockType {
    return typeof type === 'string' && Object.hasOwn(BLOCK_REGISTRY, type);
}

export function isContainerType(type: BlockType): boolean {
    return CONTAINER_TYPES.includes(type);
}

/** The module of a Block type known only at runtime: its props and blocks are the union over all types. */
export function blockModule(type: BlockType): BlockTypeModule<BlockType> {
    return BLOCK_REGISTRY[type];
}
