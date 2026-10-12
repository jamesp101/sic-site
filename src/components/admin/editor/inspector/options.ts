/** Option lists for the inspector selects (labels are human wording; values match `src/lib/blocks/types.ts`). */
export interface Option {
    value: string | number;
    label: string;
}

export const GAP_OPTIONS: Option[] = [
    { value: 'none', label: 'None' },
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
];

export const ALIGN_OPTIONS: Option[] = [
    { value: 'inherit', label: 'Inherit' },
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Centre' },
    { value: 'right', label: 'Right' },
];

export const BACKGROUND_OPTIONS: Option[] = [
    { value: 'none', label: 'None' },
    { value: 'surface', label: 'Surface' },
    { value: 'alt', label: 'Soft' },
    { value: 'accent', label: 'Accent' },
    { value: 'gold', label: 'Gold' },
];

export const DIRECTION_OPTIONS: Option[] = [
    { value: 'row', label: 'Row' },
    { value: 'column', label: 'Column' },
    { value: 'responsive', label: 'Stack on mobile, row on desktop' },
];

export const CROSS_ALIGN_OPTIONS: Option[] = [
    { value: 'start', label: 'Start' },
    { value: 'center', label: 'Centre' },
    { value: 'end', label: 'End' },
    { value: 'stretch', label: 'Stretch' },
];

export const JUSTIFY_OPTIONS: Option[] = [
    { value: 'start', label: 'Start' },
    { value: 'center', label: 'Centre' },
    { value: 'end', label: 'End' },
    { value: 'between', label: 'Space between' },
];

export const GRID_COLUMN_OPTIONS: Option[] = [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }));
export const COLUMN_COUNT_OPTIONS: Option[] = [2, 3].map((n) => ({ value: n, label: String(n) }));

export const RATIO_OPTIONS: Option[] = [
    { value: 'equal', label: 'Equal' },
    { value: 'wide-left', label: 'Wide left' },
    { value: 'wide-right', label: 'Wide right' },
];

export const SPACER_OPTIONS: Option[] = [
    { value: 'sm', label: 'Small' },
    { value: 'md', label: 'Medium' },
    { value: 'lg', label: 'Large' },
    { value: 'xl', label: 'Extra large' },
];

export const DIVIDER_OPTIONS: Option[] = [
    { value: 'default', label: 'Default' },
    { value: 'strong', label: 'Strong' },
    { value: 'gold', label: 'Gold' },
];

export const HEADING_LEVEL_OPTIONS: Option[] = [
    { value: 2, label: 'Heading 2 (section)' },
    { value: 3, label: 'Heading 3 (subsection)' },
    { value: 4, label: 'Heading 4 (minor)' },
];

export const TEXT_SIZE_OPTIONS: Option[] = [
    { value: 'sm', label: 'Small' },
    { value: 'base', label: 'Normal' },
    { value: 'lg', label: 'Large' },
];

export const TEXT_TONE_OPTIONS: Option[] = [
    { value: 'default', label: 'Default' },
    { value: 'muted', label: 'Muted' },
];

export const BUTTON_VARIANT_OPTIONS: Option[] = [
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'ghost', label: 'Ghost' },
];

export const CALLOUT_TONE_OPTIONS: Option[] = [
    { value: 'info', label: 'Information' },
    { value: 'success', label: 'Success' },
    { value: 'warning', label: 'Warning' },
];

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
