# Tree editors: Navigation links and Org chart

Both editors (`NavLinksEditor.svelte`, `components/admin/members/OrgChartEditor.svelte`) send every structural change, and every rename or visibility patch, through one `createTreeEditSession` (`src/lib/tree-edit-session.ts`, free of `astro:*`). It owns:

- the confirmed and optimistic trees;
- a save queue: saves run one at a time, in edit order;
- rollback to the last confirmed tree, with the failure message/announcement returned in the `EditResult`;
- undo/redo. History rolls back together with the tree after a failed save: earlier confirmed entries stay undoable; `record: false` edits and `adopt`ed changes made elsewhere stay out.

An editor hands the session a port (the `reorder`/`update` actions) and the tree's `ops` (`navTreeOps` in `nav-tree.ts`, `orgTreeOps` in `org-tree.ts`); commit, rollback and undo stay in the session.

## Navigation links

A proposed nav tree is checked by `proposeNavTree`, built on the same `reorderError` the `navlinks.reorder` action runs, so editor and server give one message. Default menu and links: `public-site.md`.

## Org chart

- `/admin/departments/<id>/members` is a visual editor (drag and keyboard driven); the public look is `components/site/OrgChart.astro`.
- All tree logic (ordering, moves, cycle checks, reparent-on-delete) lives in `src/lib/org-tree.ts`, shared with `actions/members.ts`: `reorder` takes `[{id, parentId, order}]` for one department in a transaction; `delete` moves direct reports up to the manager.
