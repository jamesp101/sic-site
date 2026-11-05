import type { Layer, SlideMobile } from '@/lib/carousel-overlay';

/** Slide as the admin designer sees it (read model: `toDesignerSlide` in `server/slides.ts`). */
export interface DesignerSlide {
    id: number;
    imageUrl: string;
    title: string | null;
    subtitle: string | null;
    linkUrl: string | null;
    order: number;
    departmentId: number | null;
    showOnMain: boolean;
    /** A legacy slide (title / subtitle / link only) arrives already converted to layers. */
    layers: Layer[];
    /** Slide-level phone settings (photo focal point); null = centred. */
    mobile: SlideMobile | null;
    /** Public URL of the uploaded background video, or the YouTube link; '' = none. */
    video: string;
    videoKind: 'file' | 'youtube' | null;
}
