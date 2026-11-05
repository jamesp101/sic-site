/**
 * Block document model. Pure types and constants (no zod, no DOM) so the public renderer,
 * the server-side validator and the admin editor share one contract.
 *
 * Storage: a JSON string `{"type":"sic-blocks","version":1,"blocks":[…]}` in the existing text columns.
 * Anything else stored in those columns is legacy Markdown / MDX-lite.
 */

export const DOCUMENT_TYPE = 'sic-blocks' as const;
export const DOCUMENT_VERSION = 1 as const;

/** Hard limits enforced on save. */
export const LIMITS = {
    documentChars: 400_000,
    blocks: 400,
    depth: 6,
    text: 5_000,
    label: 300,
    url: 2_000,
    listItems: 50,
    tableRows: 60,
    tableColumns: 10,
    cell: 500,
    accordionItems: 30,
    statItems: 12,
    badgeItems: 20,
    markdown: 100_000,
    albumImages: 48,
} as const;

export type Gap = 'none' | 'sm' | 'md' | 'lg';
export type CrossAlign = 'start' | 'center' | 'end' | 'stretch';
export type TextAlign = 'inherit' | 'left' | 'center' | 'right';
export type CalloutTone = 'info' | 'success' | 'warning';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface SectionProps {
    background: 'none' | 'surface' | 'alt' | 'accent' | 'gold';
    padding: 'none' | 'sm' | 'md' | 'lg';
    align: TextAlign;
}
export interface RowProps {
    /** `responsive` stacks on small screens and lays out in a row from `md`. */
    direction: 'row' | 'column' | 'responsive';
    gap: Gap;
    align: CrossAlign;
    justify: 'start' | 'center' | 'end' | 'between';
    wrap: boolean;
}
export interface GridProps {
    columns: 1 | 2 | 3 | 4 | 5 | 6;
    gap: Gap;
}
export interface ColumnsProps {
    count: 2 | 3;
    ratio: 'equal' | 'wide-left' | 'wide-right';
    gap: Gap;
}
export interface SpacerProps {
    size: 'sm' | 'md' | 'lg' | 'xl';
}
export interface DividerProps {
    tone: 'default' | 'strong' | 'gold';
}
export interface HeadingProps {
    text: string;
    level: 2 | 3 | 4;
    align: TextAlign;
}
export interface ParagraphProps {
    /** Inline markup: `**bold**`, `*italic*`, `[label](url)`, `\` escapes. */
    text: string;
    size: 'sm' | 'base' | 'lg';
    tone: 'default' | 'muted';
    align: TextAlign;
}
export interface ListProps {
    ordered: boolean;
    items: string[];
}
export interface QuoteProps {
    text: string;
    cite: string;
}
export interface ButtonProps {
    label: string;
    href: string;
    variant: ButtonVariant;
    align: TextAlign;
}
export interface BadgesProps {
    items: string[];
}
export interface CardProps {
    title: string;
    body: string;
    imageUrl: string;
    imageAlt: string;
    linkLabel: string;
    linkHref: string;
}
export interface ImageProps {
    src: string;
    alt: string;
    /** Purely decorative images get `alt=""`; otherwise `alt` is required. */
    decorative: boolean;
    caption: string;
    width: number | null;
    height: number | null;
    /** Click-through link (`safeHref` rules); `''` = none. */
    link: string;
}
export interface AlbumImage {
    src: string;
    alt: string;
    caption: string;
}
export interface AlbumProps {
    images: AlbumImage[];
    columns: 2 | 3 | 4;
}
export interface TableProps {
    header: boolean;
    caption: string;
    rows: string[][];
}
export interface AccordionItem {
    title: string;
    body: string;
}
export interface AccordionProps {
    items: AccordionItem[];
}
export interface CalloutProps {
    tone: CalloutTone;
    title: string;
    text: string;
}
export interface StatItem {
    value: string;
    label: string;
    hint: string;
}
export interface StatsProps {
    items: StatItem[];
}
export interface VideoProps {
    url: string;
    title: string;
    caption: string;
}
export interface EventProps {
    title: string;
    /** `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` (local school time, no zone). */
    start: string;
    end: string;
    location: string;
    note: string;
}
export interface MarkdownProps {
    source: string;
}

export interface PropsByType {
    section: SectionProps;
    row: RowProps;
    grid: GridProps;
    columns: ColumnsProps;
    spacer: SpacerProps;
    divider: DividerProps;
    heading: HeadingProps;
    paragraph: ParagraphProps;
    list: ListProps;
    quote: QuoteProps;
    button: ButtonProps;
    badges: BadgesProps;
    card: CardProps;
    image: ImageProps;
    table: TableProps;
    accordion: AccordionProps;
    callout: CalloutProps;
    stats: StatsProps;
    video: VideoProps;
    event: EventProps;
    markdown: MarkdownProps;
    album: AlbumProps;
}

export type BlockType = keyof PropsByType;

export type Block<T extends BlockType = BlockType> = {
    [K in T]: {
        id: string;
        type: K;
        props: PropsByType[K];
        /** Only for container types (see `CONTAINER_TYPES` in `registry.ts`). */
        children?: Block[];
    };
}[T];

export interface BlockDocument {
    type: typeof DOCUMENT_TYPE;
    version: typeof DOCUMENT_VERSION;
    blocks: Block[];
}

export interface BlockMeta {
    label: string;
    group: 'Layout' | 'Content' | 'Media' | 'Legacy';
    description: string;
}

export const BLOCK_GROUPS = ['Layout', 'Content', 'Media', 'Legacy'] as const;
