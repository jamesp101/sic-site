/**
 * Pure helpers for the department org chart (shared by the admin editor and the `members` actions).
 * Siblings are ordered by (`order`, `id`) exactly like the public chart; every move renumbers the
 * affected sibling lists 1..n and reports only the rows that actually changed.
 */

export interface OrgLinked {
    id: number;
    parentId: number | null;
    order: number;
}

export interface OrgMember extends OrgLinked {
    name: string;
    role: string;
    imageUrl: string | null;
}

export interface OrgPlacement {
    id: number;
    parentId: number | null;
    order: number;
}

export interface OrgNode<T extends OrgLinked = OrgMember> {
    member: T;
    children: OrgNode<T>[];
}

export type DropPosition = 'before' | 'after' | 'child';
export type KeyboardMove = 'up' | 'down' | 'out' | 'in';

const byOrder = (a: OrgLinked, b: OrgLinked) => a.order - b.order || a.id - b.id;

/** Parent id that exists in the list; a dangling parent reference counts as top level. */
function effectiveParents(members: OrgLinked[]): Map<number, number | null> {
    const ids = new Set(members.map((m) => m.id));
    return new Map(members.map((m) => [m.id, m.parentId !== null && ids.has(m.parentId) ? m.parentId : null]));
}

/** Members reporting to `parentId` (`null` = top level), in display order. */
export function siblingsOf<T extends OrgLinked>(members: T[], parentId: number | null): T[] {
    const parents = effectiveParents(members);
    return members.filter((m) => parents.get(m.id) === parentId).sort(byOrder);
}

/** Top-down forest. Members caught in a cycle (never reachable from a root) are surfaced as roots. */
export function buildOrgTree<T extends OrgLinked>(members: T[]): OrgNode<T>[] {
    const parents = effectiveParents(members);
    const groups = new Map<number | null, T[]>();
    for (const member of [...members].sort(byOrder)) {
        const key = parents.get(member.id) ?? null;
        groups.set(key, [...(groups.get(key) ?? []), member]);
    }
    const seen = new Set<number>();
    const build = (member: T): OrgNode<T> => {
        seen.add(member.id);
        return {
            member,
            children: (groups.get(member.id) ?? []).filter((child) => !seen.has(child.id)).map(build),
        };
    };
    const roots = (groups.get(null) ?? []).map(build);
    for (const member of [...members].sort(byOrder)) if (!seen.has(member.id)) roots.push(build(member));
    return roots;
}

/** Ids of `id` and every member below it. */
export function subtreeIds(members: OrgLinked[], id: number): Set<number> {
    const children = new Map<number, number[]>();
    for (const m of members) {
        if (m.parentId !== null) children.set(m.parentId, [...(children.get(m.parentId) ?? []), m.id]);
    }
    const result = new Set<number>([id]);
    const stack = [id];
    while (stack.length > 0) {
        for (const child of children.get(stack.pop() as number) ?? []) {
            if (!result.has(child)) {
                result.add(child);
                stack.push(child);
            }
        }
    }
    return result;
}

/** True when making `parentId` the manager of `id` would create a loop. */
export function wouldCycle(members: OrgLinked[], id: number, parentId: number | null): boolean {
    return parentId !== null && subtreeIds(members, id).has(parentId);
}

/** True when following parents from any member ever returns to a visited member. */
export function hasCycle(members: { id: number; parentId: number | null }[]): boolean {
    const parents = new Map(members.map((m) => [m.id, m.parentId]));
    const done = new Set<number>();
    for (const { id } of members) {
        const path = new Set<number>();
        for (
            let cursor: number | null | undefined = id;
            cursor != null && !done.has(cursor);
            cursor = parents.get(cursor)
        ) {
            if (path.has(cursor)) return true;
            path.add(cursor);
        }
        for (const visited of path) done.add(visited);
    }
    return false;
}

export function applyPlacements<T extends OrgLinked>(members: T[], placements: OrgPlacement[]): T[] {
    const next = new Map(placements.map((p) => [p.id, p]));
    return members.map((m) => {
        const p = next.get(m.id);
        return p ? { ...m, parentId: p.parentId, order: p.order } : m;
    });
}

/** The placements that restore the current values of the members touched by `placements`. */
export function invertPlacements(members: OrgLinked[], placements: OrgPlacement[]): OrgPlacement[] {
    const current = new Map(members.map((m) => [m.id, m]));
    return placements.flatMap((p) => {
        const m = current.get(p.id);
        return m ? [{ id: m.id, parentId: m.parentId, order: m.order }] : [];
    });
}

/** Order for a new last child of `parentId`. */
export function nextOrder(members: OrgLinked[], parentId: number | null): number {
    return siblingsOf(members, parentId).reduce((max, m) => Math.max(max, m.order), 0) + 1;
}

/** Renumbers `ids` 1..n under `parentId`, returning only rows whose parent or order changes. */
function renumber(byId: Map<number, OrgLinked>, ids: number[], parentId: number | null): OrgPlacement[] {
    const changed: OrgPlacement[] = [];
    ids.forEach((id, i) => {
        const m = byId.get(id)!;
        if (m.parentId !== parentId || m.order !== i + 1) changed.push({ id, parentId, order: i + 1 });
    });
    return changed;
}

/**
 * Moves `id` under `parentId` at `index` among that parent's other children (clamped).
 * Returns the changed placements (empty = nothing to do) or `null` when the move is illegal.
 */
export function moveMember(
    members: OrgLinked[],
    id: number,
    parentId: number | null,
    index: number,
): OrgPlacement[] | null {
    const byId = new Map(members.map((m) => [m.id, m]));
    if (!byId.has(id)) return null;
    if (parentId !== null && (!byId.has(parentId) || wouldCycle(members, id, parentId))) return null;

    const oldParent = effectiveParents(members).get(id) ?? null;
    const target = siblingsOf(members, parentId)
        .filter((m) => m.id !== id)
        .map((m) => m.id);
    target.splice(Math.max(0, Math.min(index, target.length)), 0, id);
    const changes = renumber(byId, target, parentId);
    if (oldParent !== parentId) {
        const old = siblingsOf(members, oldParent)
            .filter((m) => m.id !== id)
            .map((m) => m.id);
        changes.push(...renumber(byId, old, oldParent));
    }
    return changes;
}

/** Whether `id` may be dropped next to / onto `targetId` (never onto itself or its own subtree). */
export function canDrop(members: OrgLinked[], id: number, targetId: number): boolean {
    return members.some((m) => m.id === id) && !subtreeIds(members, id).has(targetId);
}

/** Drag-and-drop move: before/after `targetId` as a sibling, or as its last child. */
export function moveRelative(
    members: OrgLinked[],
    id: number,
    targetId: number,
    position: DropPosition,
): OrgPlacement[] | null {
    if (!canDrop(members, id, targetId)) return null;
    if (position === 'child') return moveMember(members, id, targetId, Number.MAX_SAFE_INTEGER);
    const parent = effectiveParents(members).get(targetId) ?? null;
    const others = siblingsOf(members, parent).filter((m) => m.id !== id);
    const at = others.findIndex((m) => m.id === targetId);
    return moveMember(members, id, parent, position === 'before' ? at : at + 1);
}

/** Drop on the top-level lane: becomes the last root. */
export function moveToRoot(members: OrgLinked[], id: number): OrgPlacement[] | null {
    return moveMember(members, id, null, Number.MAX_SAFE_INTEGER);
}

/**
 * Keyboard restructuring: `up`/`down` swap with a sibling, `out` reports to the grandparent (or becomes
 * a root) right after its former manager, `in` reports to the previous sibling as its last child.
 * `null` = not possible from here.
 */
export function keyboardMove(members: OrgLinked[], id: number, move: KeyboardMove): OrgPlacement[] | null {
    const parents = effectiveParents(members);
    if (!parents.has(id)) return null;
    const parent = parents.get(id) ?? null;
    const siblings = siblingsOf(members, parent);
    const index = siblings.findIndex((m) => m.id === id);
    switch (move) {
        case 'up':
            return index > 0 ? moveMember(members, id, parent, index - 1) : null;
        case 'down':
            return index < siblings.length - 1 ? moveMember(members, id, parent, index + 1) : null;
        case 'out': {
            if (parent === null) return null;
            const grand = parents.get(parent) ?? null;
            const at = siblingsOf(members, grand).findIndex((m) => m.id === parent);
            return moveMember(members, id, grand, at + 1);
        }
        case 'in':
            return index > 0 ? moveMember(members, id, siblings[index - 1].id, Number.MAX_SAFE_INTEGER) : null;
    }
}

/**
 * Deleting `id` hands its direct reports to its own manager (or makes them roots), keeping their order
 * and slotting them where `id` stood. Returns the changed placements of the survivors.
 */
export function reparentOnDelete(members: OrgLinked[], id: number): OrgPlacement[] {
    const byId = new Map(members.map((m) => [m.id, m]));
    if (!byId.has(id)) return [];
    const parent = effectiveParents(members).get(id) ?? null;
    const reports = siblingsOf(members, id).map((m) => m.id);
    const list = siblingsOf(members, parent).map((m) => m.id);
    list.splice(list.indexOf(id), 1, ...reports);
    return renumber(byId, list, parent);
}

/** The members after `id` is deleted and its reports moved up. */
export function removeMember<T extends OrgLinked>(members: T[], id: number): T[] {
    return applyPlacements(
        members.filter((m) => m.id !== id),
        reparentOnDelete(members, id),
    );
}

/** Server-side check of a reorder payload against the department's current members. */
export function placementsError(existing: OrgLinked[], placements: OrgPlacement[]): string | null {
    const ids = new Set(existing.map((m) => m.id));
    const seen = new Set<number>();
    for (const p of placements) {
        if (!ids.has(p.id)) return 'A member does not belong to this department.';
        if (seen.has(p.id)) return 'A member is listed more than once.';
        seen.add(p.id);
        if (p.parentId !== null && !ids.has(p.parentId))
            return 'The selected parent does not belong to this department.';
        if (p.parentId === p.id) return 'A member cannot report to itself.';
    }
    if (hasCycle(applyPlacements(existing, placements))) {
        return 'A member cannot report to itself or to one of its own subordinates.';
    }
    return null;
}

export interface ParentOption {
    id: number;
    name: string;
    role: string;
    depth: number;
}

/** Candidate managers in chart order (depth-first), leaving out `excludeId` and everything below it. */
export function parentOptions(members: OrgMember[], excludeId?: number): ParentOption[] {
    const out: ParentOption[] = [];
    const walk = (nodes: OrgNode[], depth: number) => {
        for (const node of nodes) {
            if (node.member.id === excludeId) continue;
            out.push({ id: node.member.id, name: node.member.name, role: node.member.role, depth });
            walk(node.children, depth + 1);
        }
    };
    walk(buildOrgTree(members), 0);
    return out;
}

/** Ids of members whose name or role contains `query` (case-insensitive); empty query matches nobody. */
export function matchMembers(members: OrgMember[], query: string): number[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return members
        .filter((m) => m.name.toLowerCase().includes(needle) || m.role.toLowerCase().includes(needle))
        .map((m) => m.id);
}

/** 1-based position among siblings, sibling count, depth (1 = top level) and manager id of `id`. */
export function positionOf(members: OrgLinked[], id: number) {
    const parent = effectiveParents(members).get(id) ?? null;
    const siblings = siblingsOf(members, parent);
    let level = 1;
    for (let cursor = parent; cursor !== null; cursor = effectiveParents(members).get(cursor) ?? null) level += 1;
    return { index: siblings.findIndex((m) => m.id === id) + 1, count: siblings.length, level, parentId: parent };
}
