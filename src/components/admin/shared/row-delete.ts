/**
 * Row deletes on admin list pages: server-rendered trigger buttons (`DeleteRowButton.astro`) and one
 * `RowDeleteDialog` island per page, so a long list does not hydrate one component per row.
 * Free of `astro:*` imports: the trigger renders on the server, the dialog in the browser.
 */
export type RowDeleteKind = 'post' | 'heroSection' | 'department' | 'user';

export interface RowDeleteText {
    /** Accessible name of the row's trigger button. */
    label: (name: string) => string;
    title: (name: string) => string;
    description: string;
}

export const ROW_DELETE: Record<RowDeleteKind, RowDeleteText> = {
    post: {
        label: (name) => `Delete post ${name}`,
        title: () => 'Delete this post?',
        description: 'The post and its highlight image will be permanently removed. This cannot be undone.',
    },
    heroSection: {
        label: (name) => `Delete hero section ${name}`,
        title: () => 'Delete this hero section?',
        description: 'The hero section will be permanently removed.',
    },
    department: {
        label: (name) => `Delete ${name}`,
        title: (name) => `Delete ${name}?`,
        description: 'The department, its members, carousel slides and uploaded images will be permanently removed.',
    },
    user: {
        label: (name) => `Delete ${name}`,
        title: (name) => `Delete ${name}?`,
        description: 'The account, its sessions and content authored by this user will be permanently removed.',
    },
};

/** Attribute that marks a trigger button; its value is the `RowDeleteKind`. */
export const ROW_DELETE_ATTR = 'data-row-delete';
