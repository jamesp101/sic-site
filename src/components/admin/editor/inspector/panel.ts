import type { Block, BlockType } from '@/lib/blocks/types';

/** What the Inspector hands to the panel of the selected Block type. */
export interface PanelProps<T extends BlockType> {
    block: Block<T>;
    /** Merges a patch into the block's props. */
    set: (patch: Record<string, unknown>) => void;
    /** Unique control id for a field of the selected block. */
    fid: (field: string) => string;
    /** Inline problem per prop, from the Block type's schema and rules (`blockFieldErrors`). */
    errors: Record<string, string>;
    /** Markdown blocks only: converts the legacy source into blocks. */
    onconvert?: (id: string) => void;
}
