/**
 * Org chart session: the one place that owns the member list of a Department's org chart while it is edited.
 * Free of `astro:*` and Svelte so it is unit-tested with an in-memory port.
 *
 * - Moves and renames are optimistic edits of a {@link createTreeEditSession} (queue, rollback, undo history).
 * - Create, update (the full form) and delete wait for the queued edits, hit the port, and on success fold the saved
 *   result into the session; on failure nothing changes and the failure goes back to the caller.
 */

import type { OrgChange, OrgMember, OrgPlacement } from './org-tree';
import { orgTreeOps, removeMember } from './org-tree';
import { createTreeEditSession, type EditResult, type SaveOutcome, type TreeEditSnapshot } from './tree-edit-session';

/** What the member form submits. */
export interface MemberValues {
    name: string;
    role: string;
    parentId: number | null;
    order: number;
    image: File | null;
}

/** Field errors and a general message of a refused create or update. */
export interface MemberFailure {
    fields: Record<string, string>;
    message: string;
}

export type CreateOutcome =
    | { ok: true; id: number; order: number; imageUrl: string | null }
    | { ok: false; failure: MemberFailure };
export type UpdateOutcome = { ok: true; imageUrl: string | null } | { ok: false; failure: MemberFailure };

/** The server, as the org chart session sees it. */
export interface OrgChartPort {
    reorder(placements: OrgPlacement[]): Promise<SaveOutcome>;
    /** Renames `current` (the confirmed member) to `name`. */
    rename(current: OrgMember, name: string): Promise<SaveOutcome>;
    create(values: MemberValues): Promise<CreateOutcome>;
    update(id: number, values: MemberValues): Promise<UpdateOutcome>;
    remove(id: number): Promise<SaveOutcome>;
}

export type CreateResult = { ok: true; member: OrgMember } | { ok: false; failure: MemberFailure };
export type UpdateResult = { ok: true } | { ok: false; failure: MemberFailure };
export type RemoveResult = { ok: true } | { ok: false; message: string };

export interface OrgChartSession {
    snapshot(): TreeEditSnapshot<OrgMember[]>;
    edit(change: OrgChange, options?: { record?: boolean }): Promise<EditResult>;
    undo(): Promise<EditResult>;
    redo(): Promise<EditResult>;
    create(values: MemberValues): Promise<CreateResult>;
    update(id: number, values: MemberValues): Promise<UpdateResult>;
    remove(id: number): Promise<RemoveResult>;
}

export const MEMBER_GONE = 'This member no longer exists.';
const DELETE_FAILED = 'The member could not be deleted.';

export function createOrgChartSession(options: {
    members: OrgMember[];
    port: OrgChartPort;
    onChange?: (snapshot: TreeEditSnapshot<OrgMember[]>) => void;
}): OrgChartSession {
    const { port, onChange } = options;
    const tree = createTreeEditSession<OrgMember[], OrgChange>({
        tree: options.members.map((m) => ({ ...m })),
        ops: orgTreeOps,
        onChange,
        port: {
            async save(change, confirmed) {
                if (change.kind === 'place') return port.reorder(change.placements);
                const current = confirmed.find((m) => m.id === change.id);
                if (!current) return { ok: false, message: MEMBER_GONE };
                return port.rename(current, change.name);
            },
        },
    });

    return {
        snapshot: () => tree.snapshot(),
        edit: (...args: Parameters<typeof tree.edit>) => tree.edit(...args),
        undo: () => tree.undo(),
        redo: () => tree.redo(),

        async create(values) {
            await tree.settled();
            const outcome = await port.create(values);
            if (!outcome.ok) return outcome;
            const member: OrgMember = {
                id: outcome.id,
                name: values.name,
                role: values.role,
                parentId: values.parentId,
                order: outcome.order,
                imageUrl: outcome.imageUrl,
            };
            tree.adopt((list) => [...list, member]);
            return { ok: true, member };
        },

        async update(id, values) {
            await tree.settled();
            const current = tree.snapshot().confirmed.find((m) => m.id === id);
            if (!current) return { ok: false, failure: { fields: {}, message: MEMBER_GONE } };
            const outcome = await port.update(id, values);
            if (!outcome.ok) return outcome;
            const patch = {
                name: values.name,
                role: values.role,
                parentId: values.parentId,
                order: values.order,
                imageUrl: outcome.imageUrl,
            };
            tree.adopt((list) => list.map((m) => (m.id === id ? { ...m, ...patch } : m)), {
                resetHistory: patch.parentId !== current.parentId || patch.order !== current.order,
            });
            return { ok: true };
        },

        async remove(id) {
            await tree.settled();
            const outcome = await port.remove(id);
            if (!outcome.ok) return { ok: false, message: outcome.message || DELETE_FAILED };
            tree.adopt((list) => removeMember(list, id), { resetHistory: true });
            return { ok: true };
        },
    };
}
