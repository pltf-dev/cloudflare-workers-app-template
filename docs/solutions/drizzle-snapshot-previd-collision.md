---
category: bug
tags: [drizzle, drizzle-kit, migration, sqlite, d1, worktree, parallel-branches]
component: migrations/meta/
symptoms: "drizzle-kit generate aborts: snapshots are pointing to a parent snapshot ... which is a collision"
root_cause: two migrations generated independently off the same parent snapshot; later snapshot's prevId never rebased onto the earlier one
---

# Drizzle snapshot prevId collision (forked migration chain)

## Problem

`pnpm db:generate` failed before diffing:

```
Error: [migrations/meta/0008_snapshot.json, migrations/meta/0009_snapshot.json] are
pointing to a parent snapshot: migrations/meta/0008_snapshot.json/snapshot.json which
is a collision.
```

## Root cause

Drizzle snapshots form a linked list via `id`/`prevId`. Two siblings claimed the same
parent:

- `0007` id = `dfff3e68…`
- `0008` prevId = `dfff3e68…` → 0007 ✓
- `0009` prevId = `dfff3e68…` → **0007 again** ✗ (should be 0008's id `28108e04…`)

Drizzle walks the chain, finds two children of one parent, and aborts. Tell-tale sign
in `_journal.json`: idx 9's `when` timestamp was *earlier* than idx 8's — the two
migrations were generated independently (parallel branches / worktrees) and
0009 was never rebased onto 0008.

## Fix

Before touching `prevId`, verify the later snapshot's **content** is the correct
cumulative state. Here `0009_snapshot.json` already contained both 0008's
later table and 0009's new columns, so only
the pointer was stale. One-field repair:

```jsonc
// migrations/meta/0009_snapshot.json
"prevId": "28108e04-c460-45d4-83b9-885651042b5c",  // was dfff3e68… (0007); now 0008's id
```

`pnpm db:generate` then reported "No schema changes, nothing to migrate" — confirming
no spurious `0010` and that the snapshot matches `schema.ts`.

## Prevention

- **Check content before repointing.** If the later snapshot was branched off the old
  parent in isolation, it may be *missing* the sibling's tables. Then repointing
  `prevId` alone is wrong — the next `generate` would emit a duplicate `CREATE TABLE`.
  In that case delete the offending migration + snapshot, rebase the branch, and
  regenerate so the chain and cumulative schema are both correct.
- When two feature branches each add a migration, the second to merge should regenerate
  its migration on top of the first rather than keeping its independently-numbered one.
- Quick triage: dump every snapshot's `id`/`prevId` and look for a duplicated `prevId`.
