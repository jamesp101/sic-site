/** Ids of `rootId` and every descendant, given the department's (id, parentId) pairs. */
export function subtreeIds(nodes: { id: number; parentId: number | null }[], rootId: number): Set<number> {
    const children = new Map<number, number[]>();
    for (const node of nodes) {
        if (node.parentId === null) continue;
        children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
    }
    const result = new Set<number>([rootId]);
    const stack = [rootId];
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
