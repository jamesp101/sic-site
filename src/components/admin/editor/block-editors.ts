/**
 * Client side of the Block type registry: the palette icon and Inspector panel of every Block type. Keyed by
 * `BlockType` like the server registry (`@/lib/blocks/registry`), so the compiler rejects a Block type
 * without an icon or a panel. Kept apart from the server modules so those stay free of Svelte.
 */
import {
    CalendarDays,
    ChevronsUpDown,
    Columns2,
    FileText,
    Hash,
    Heading,
    IdCard,
    Image,
    Images,
    Info,
    LayoutGrid,
    List,
    Minus,
    MousePointerClick,
    MoveVertical,
    Quote,
    RectangleHorizontal,
    StretchHorizontal,
    Table,
    Tags,
    Type,
    Video,
} from '@lucide/svelte';
import type { Component } from 'svelte';
import type { BlockType } from '@/lib/blocks/types';
import SectionPanel from './inspector/panels/SectionPanel.svelte';
import RowPanel from './inspector/panels/RowPanel.svelte';
import GridPanel from './inspector/panels/GridPanel.svelte';
import ColumnsPanel from './inspector/panels/ColumnsPanel.svelte';
import SpacerPanel from './inspector/panels/SpacerPanel.svelte';
import DividerPanel from './inspector/panels/DividerPanel.svelte';
import HeadingPanel from './inspector/panels/HeadingPanel.svelte';
import ParagraphPanel from './inspector/panels/ParagraphPanel.svelte';
import ListPanel from './inspector/panels/ListPanel.svelte';
import QuotePanel from './inspector/panels/QuotePanel.svelte';
import ButtonPanel from './inspector/panels/ButtonPanel.svelte';
import BadgesPanel from './inspector/panels/BadgesPanel.svelte';
import CardPanel from './inspector/panels/CardPanel.svelte';
import ImagePanel from './inspector/panels/ImagePanel.svelte';
import AlbumPanel from './inspector/panels/AlbumPanel.svelte';
import TablePanel from './inspector/panels/TablePanel.svelte';
import AccordionPanel from './inspector/panels/AccordionPanel.svelte';
import CalloutPanel from './inspector/panels/CalloutPanel.svelte';
import StatsPanel from './inspector/panels/StatsPanel.svelte';
import VideoPanel from './inspector/panels/VideoPanel.svelte';
import EventPanel from './inspector/panels/EventPanel.svelte';
import MarkdownPanel from './inspector/panels/MarkdownPanel.svelte';
import type { PanelProps } from './inspector/panel';

export interface EditorBlockType<T extends BlockType> {
    icon: typeof Info;
    inspector: Component<PanelProps<T>>;
}

export const EDITOR_BLOCKS: { [T in BlockType]: EditorBlockType<T> } = {
    section: { icon: RectangleHorizontal, inspector: SectionPanel },
    row: { icon: StretchHorizontal, inspector: RowPanel },
    grid: { icon: LayoutGrid, inspector: GridPanel },
    columns: { icon: Columns2, inspector: ColumnsPanel },
    spacer: { icon: MoveVertical, inspector: SpacerPanel },
    divider: { icon: Minus, inspector: DividerPanel },
    heading: { icon: Heading, inspector: HeadingPanel },
    paragraph: { icon: Type, inspector: ParagraphPanel },
    list: { icon: List, inspector: ListPanel },
    quote: { icon: Quote, inspector: QuotePanel },
    button: { icon: MousePointerClick, inspector: ButtonPanel },
    badges: { icon: Tags, inspector: BadgesPanel },
    card: { icon: IdCard, inspector: CardPanel },
    image: { icon: Image, inspector: ImagePanel },
    album: { icon: Images, inspector: AlbumPanel },
    table: { icon: Table, inspector: TablePanel },
    accordion: { icon: ChevronsUpDown, inspector: AccordionPanel },
    callout: { icon: Info, inspector: CalloutPanel },
    stats: { icon: Hash, inspector: StatsPanel },
    video: { icon: Video, inspector: VideoPanel },
    event: { icon: CalendarDays, inspector: EventPanel },
    markdown: { icon: FileText, inspector: MarkdownPanel },
};

/** The Inspector panel of a Block type known only at runtime: its block and props are the union over all types. */
export function inspectorPanel(type: BlockType): Component<PanelProps<BlockType>> {
    return EDITOR_BLOCKS[type].inspector as unknown as Component<PanelProps<BlockType>>;
}
