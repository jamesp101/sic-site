import type { Layer } from '@/lib/carousel-overlay';

/** One tile of the slide strip. */
export interface StripSlide {
    key: string;
    /** null while the slide has not been saved yet. */
    id: number | null;
    imageUrl: string | null;
    layers: Layer[];
    dirty: boolean;
    departmentId: number | null;
    showOnMain: boolean;
    title: string;
}
