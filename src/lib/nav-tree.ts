/**
 * Pure helpers for the two-level navigation tree (shared by the admin editor and the reorder action).
 * Rule: top-level links may have children; a link that has children can never become a child itself.
 */

export interface NavNode {
    id: number;
    label: string;
    url: string;
    isActive: boolean;
    /** Position among siblings, 1-based after any reorder. */
    order: number;
    children: NavNode[];
}

export interface ReorderItem {
    id: number;
    parentId: number | null;
    order: number;
}

/** Accepts site paths, anchors and http(s)/mailto/tel URLs; rejects javascript:, data: and other schemes. */
export function navUrlError(raw: string): string | null {
    const url = raw.trim();
    if (!url) return 'The URL is required.';
    if (/\s/.test(url)) return 'The URL must not contain spaces.';
    if (url.startsWith('//')) return 'Use a path such as /posts or a full https:// URL.';
    if (url.startsWith('/') || url.startsWith('#')) return null;
    if (/^(https?:\/\/|mailto:|tel:)\S+$/i.test(url)) return null;
    return 'Use a path such as /posts or a full https:// URL.';
}

export function cloneTree(tree: NavNode[]): NavNode[] {
    return tree.map((node) => ({ ...node, children: node.children.map((child) => ({ ...child, children: [] })) }));
}

/** Returns a copy with `order` renumbered 1..n among siblings. */
export function renumber(tree: NavNode[]): NavNode[] {
    return tree.map((node, i) => ({
        ...node,
        order: i + 1,
        children: node.children.map((child, j) => ({ ...child, order: j + 1, children: [] })),
    }));
}

export function toPayload(tree: NavNode[]): ReorderItem[] {
    return tree.flatMap((node, i) => [
        { id: node.id, parentId: null, order: i + 1 },
        ...node.children.map((child, j) => ({ id: child.id, parentId: node.id, order: j + 1 })),
    ]);
}

export function samePayload(a: ReorderItem[], b: ReorderItem[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((item, i) => item.id === b[i].id && item.parentId === b[i].parentId && item.order === b[i].order);
}

/** True when no child holds children of its own (the two-level rule). */
export function isTwoLevel(tree: NavNode[]): boolean {
    return tree.every((node) => node.children.every((child) => child.children.length === 0));
}

export interface Position {
    parentIndex: number | null;
    index: number;
}

export function locate(tree: NavNode[], id: number): Position | null {
    for (let i = 0; i < tree.length; i++) {
        if (tree[i].id === id) return { parentIndex: null, index: i };
        const j = tree[i].children.findIndex((child) => child.id === id);
        if (j >= 0) return { parentIndex: i, index: j };
    }
    return null;
}

function swap(tree: NavNode[], id: number, delta: -1 | 1): NavNode[] | null {
    const pos = locate(tree, id);
    if (!pos) return null;
    const next = cloneTree(tree);
    const list = pos.parentIndex === null ? next : next[pos.parentIndex].children;
    const target = pos.index + delta;
    if (target < 0 || target >= list.length) return null;
    [list[pos.index], list[target]] = [list[target], list[pos.index]];
    return renumber(next);
}

export const moveUp = (tree: NavNode[], id: number) => swap(tree, id, -1);
export const moveDown = (tree: NavNode[], id: number) => swap(tree, id, 1);

export function canIndent(tree: NavNode[], id: number): boolean {
    const pos = locate(tree, id);
    return !!pos && pos.parentIndex === null && pos.index > 0 && tree[pos.index].children.length === 0;
}

/** Makes a childless top-level link the last child of the top-level link above it. */
export function indent(tree: NavNode[], id: number): NavNode[] | null {
    if (!canIndent(tree, id)) return null;
    const pos = locate(tree, id)!;
    const next = cloneTree(tree);
    const [node] = next.splice(pos.index, 1);
    next[pos.index - 1].children.push(node);
    return renumber(next);
}

export function canOutdent(tree: NavNode[], id: number): boolean {
    return locate(tree, id)?.parentIndex != null;
}

/** Moves a child to the top level, directly after its former parent. */
export function outdent(tree: NavNode[], id: number): NavNode[] | null {
    const pos = locate(tree, id);
    if (!pos || pos.parentIndex === null) return null;
    const next = cloneTree(tree);
    const [node] = next[pos.parentIndex].children.splice(pos.index, 1);
    next.splice(pos.parentIndex + 1, 0, node);
    return renumber(next);
}

/** Rebuilds a tree from a payload and the current node data (used by undo/redo). */
export function treeFromPayload(tree: NavNode[], payload: ReorderItem[]): NavNode[] {
    const nodes = new Map<number, NavNode>();
    for (const top of tree) {
        nodes.set(top.id, { ...top, children: [] });
        for (const child of top.children) nodes.set(child.id, { ...child, children: [] });
    }
    const roots: NavNode[] = [];
    for (const item of [...payload].sort((a, b) => a.order - b.order)) {
        const node = nodes.get(item.id);
        if (!node) continue;
        if (item.parentId === null) roots.push(node);
        else nodes.get(item.parentId)?.children.push(node);
    }
    return renumber(roots);
}

/**
 * Validates a reorder request against the parent map currently stored (`existing`).
 * Returns an error message, or null when the resulting tree is valid.
 */
export function reorderError(items: ReorderItem[], existing: { id: number; parentId: number | null }[]): string | null {
    const known = new Set(existing.map((row) => row.id));
    const seen = new Set<number>();
    for (const item of items) {
        if (seen.has(item.id)) return 'A link appears more than once.';
        seen.add(item.id);
        if (!known.has(item.id)) return 'One of the links no longer exists.';
        if (item.parentId === item.id) return 'A link cannot be its own parent.';
    }
    const finalParent = new Map<number, number | null>(existing.map((row) => [row.id, row.parentId]));
    for (const item of items) finalParent.set(item.id, item.parentId);
    for (const [id, parentId] of finalParent) {
        if (parentId === null) continue;
        if (!known.has(parentId)) return 'The selected parent link does not exist.';
        if (finalParent.get(parentId) !== null) {
            return id === parentId
                ? 'A link cannot be its own parent.'
                : 'Navigation is two levels deep: only top-level links can have sub-links.';
        }
    }
    return null;
}

// ---- link kinds, suggestions, warnings ---------------------------------------------------------

export type NavLinkKind =
    | 'page'
    | 'department'
    | 'post'
    | 'departments-menu'
    | 'anchor'
    | 'external'
    | 'email'
    | 'phone';

export const NAV_KIND_LABEL: Record<NavLinkKind, string> = {
    page: 'Page',
    department: 'Department',
    post: 'Post',
    'departments-menu': 'Departments menu (auto)',
    anchor: 'Anchor',
    external: 'External',
    email: 'Email',
    phone: 'Phone',
};

/** URL that the public header turns into a dropdown of every department. */
export const DEPARTMENTS_MENU_URL = '#departments';

/** Detects what a navigation URL points at. Returns null for an empty URL. */
export function classifyUrl(raw: string): NavLinkKind | null {
    const url = raw.trim();
    if (!url) return null;
    if (url === DEPARTMENTS_MENU_URL) return 'departments-menu';
    if (url.startsWith('#')) return 'anchor';
    if (/^mailto:/i.test(url)) return 'email';
    if (/^tel:/i.test(url)) return 'phone';
    if (/^https?:\/\//i.test(url)) return 'external';
    if (url.startsWith('/') && !url.startsWith('//')) {
        const path = internalPath(url);
        if (/^\/departments\/[^/]+$/.test(path)) return 'department';
        if (/^\/posts\/[^/]+$/.test(path)) return 'post';
        return 'page';
    }
    return null;
}

export interface LinkSuggestion {
    group: 'Pages' | 'Departments' | 'Posts';
    label: string;
    url: string;
}

/** The links every site has; the editor offers them as suggestions and treats them as known paths. */
export const PAGE_SUGGESTIONS: LinkSuggestion[] = [
    { group: 'Pages', label: 'Home', url: '/' },
    { group: 'Pages', label: 'News & Events', url: '/posts' },
    { group: 'Pages', label: 'Articles', url: '/posts?type=article' },
    { group: 'Pages', label: 'Events', url: '/posts?type=event' },
    { group: 'Pages', label: 'Announcements', url: '/posts?type=announcement' },
    { group: 'Pages', label: 'Downloads', url: '/downloads' },
    { group: 'Pages', label: 'Contact', url: '/contact' },
];

/** Static internal paths that exist besides departments and posts. */
export const STATIC_PATHS = ['/', '/posts', '/downloads', '/contact', '/login', '/rss.xml', '/sitemap.xml'];

/** Links created by “Use the default menu”; mirrors the public header fallback. */
export const DEFAULT_NAV_LINKS: { label: string; url: string }[] = [
    { label: 'Home', url: '/' },
    { label: 'Departments', url: DEPARTMENTS_MENU_URL },
    { label: 'News & Events', url: '/posts' },
    { label: 'Downloads', url: '/downloads' },
    { label: 'Contact', url: '/contact' },
];

/** Path of an internal URL without query or hash and without a trailing slash (except the root). */
export function internalPath(url: string): string {
    const path = url.trim().split(/[?#]/, 1)[0];
    let decoded = path;
    try {
        decoded = decodeURI(path);
    } catch {
        // keep the raw path
    }
    return decoded.length > 1 ? decoded.replace(/\/+$/, '') || '/' : decoded;
}

export type NavWarningKind = 'internal-missing' | 'duplicate';

export interface NavWarning {
    kind: NavWarningKind;
    message: string;
}

/** True when the public header ignores this link's own URL (it opens a dropdown instead). */
export function opensDropdown(node: NavNode, isTopLevel: boolean): boolean {
    return isTopLevel && (node.url.trim() === DEPARTMENTS_MENU_URL || node.children.length > 0);
}

/**
 * Warnings per link id. `internal-missing`: an internal path that matches no known page, department or post
 * (`/storage/*` is always allowed). `duplicate`: two visible links share the same URL at the same level.
 * Links whose URL is not used (dropdown parents) are skipped. Warnings never block saving.
 */
export function navWarnings(tree: NavNode[], knownPaths: Iterable<string>): Map<number, NavWarning[]> {
    const known = new Set<string>();
    for (const path of knownPaths) known.add(internalPath(path));
    const result = new Map<number, NavWarning[]>();
    const add = (id: number, warning: NavWarning) => result.set(id, [...(result.get(id) ?? []), warning]);

    const check = (nodes: NavNode[], isTopLevel: boolean) => {
        const seen = new Map<string, NavNode[]>();
        for (const node of nodes) {
            if (opensDropdown(node, isTopLevel)) continue;
            const url = node.url.trim();
            if (url.startsWith('/') && !url.startsWith('//')) {
                const path = internalPath(url);
                if (!known.has(path) && !path.startsWith('/storage/')) {
                    add(node.id, {
                        kind: 'internal-missing',
                        message: `No page, department or post exists at ${path}. Visitors would see a “not found” page.`,
                    });
                }
            }
            if (node.isActive) seen.set(url, [...(seen.get(url) ?? []), node]);
        }
        for (const [url, group] of seen) {
            if (group.length < 2) continue;
            for (const node of group) {
                add(node.id, {
                    kind: 'duplicate',
                    message: `${group.length - 1 === 1 ? 'Another visible link' : 'Other visible links'} at the same level also point to ${url}.`,
                });
            }
        }
    };

    check(tree, true);
    for (const top of tree) check(top.children, false);
    return result;
}
