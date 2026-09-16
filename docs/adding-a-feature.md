# Adding a feature

The `items` resource exists to show every layer of this app once. This document walks it
top to bottom so you can copy the shape for your own resource, then ends with the
checklist for removing the example.

The order below is the order to build in. Each step has a test before it has code.

## 1. Schema and migration

`src/db/schema.ts`:

```ts
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("draft"),
  imageKey: text("image_key"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [index("items_status_created_idx").on(table.status, table.createdAt)]);
```

Conventions: `timestamp_ms` integers for dates, `user_id` FK when rows belong to a
user, an index for the query the public page runs. Then:

```bash
pnpm db:generate                                   # writes migrations/000N_<random>.sql
mv migrations/000N_<random>.sql migrations/000N_<descriptive>.sql
# and change the matching "tag" in migrations/meta/_journal.json
pnpm db:migrate:local
```

Tests apply every migration to a fresh D1 in `test/setup.ts`, so a schema change is
covered the moment `pnpm test` runs.

## 2. Repository

`src/db/items.ts`: pure functions over `Db`. Ownership is enforced in the `WHERE`, not
just in the handler, so a bug in one caller can't leak another user's rows:

```ts
export async function updateItem(db: Db, userId: number, id: number, input: ItemInput): Promise<boolean> {
  const rows = await db.update(items).set({ ...input, updatedAt: new Date() })
    .where(and(eq(items.id, id), eq(items.userId, userId)))
    .returning({ id: items.id });
  return rows.length > 0;
}
```

Test: `test/items-repo.test.ts`. Note the `beforeEach` that empties the tables: D1 state
persists across `it` blocks within a file.

## 3. Endpoints

Two styles, both under `src/pages/api/`:

- **Form endpoints** (`api/admin/items/index.ts`, `api/admin/items/[id]/index.ts`,
  `api/admin/items/[id]/delete.ts`) receive a `POST` from an admin page, parse with
  `src/lib/form-parse.ts`, and `redirect()` back with `?saved=1` or `?error=<code>`. The
  page renders the banner. No JavaScript needed.
- **JSON endpoints** (`api/items.ts` public; `api/admin/items/[id]/image.ts` for the
  upload island) return `json({ ok, ... })`.

Handlers receive `{ request, params, locals: { userId } }`. The middleware already
guarantees `locals.userId` under `/api/admin/*`; handlers still return `401` without it
so the contract is visible in tests.

Test by importing the handler: `test/api-admin-items.test.ts`, `test/api-items.test.ts`,
`test/api-admin-item-image.test.ts`.

## 4. Media (if the resource has files)

`api/admin/items/[id]/image.ts` shows the R2 pattern: check ownership, allowlist the MIME
type and map it to an extension (`src/lib/media.ts`), cap the size, `put` under a
per-record prefix with a random name, record the key, delete the previous object. The
public read is `src/pages/media/[...key].ts`, which streams from R2 with a content-type
derived from the extension and `x-content-type-options: nosniff`.

## 5. Pages

- Admin: `src/pages/admin/items/{index,new,[id]/edit}.astro` wrapped in `AdminLayout`
  (`docs/creating-an-admin-page.md`). The list has the page-level primary action; the
  edit page mounts the one React island (`ItemImage.tsx`) for the upload.
- Public: `src/pages/index.astro` lists published items; `src/pages/items/[id].astro`
  renders one and rewrites to `/404` for drafts and unknown ids.
- Register the admin destination in `src/lib/admin/nav.ts`.
- Add public URLs to `src/pages/sitemap.xml.ts`.

## 6. Verify

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

Browser-smoke every page the E2E specs don't visit (forge a session per
`docs/solutions/local-smoke-testing-gated-admin-routes.md`). If the feature is a central
flow, add a spec in `e2e/` modelled on `publish-item.spec.ts`.

## 7. Write down what you learned

Anything non-obvious goes in `docs/solutions/` (copy `_template.md`).

## Removing the example

When your own resource is in place:

1. Delete `src/db/items.ts`, `src/pages/api/items.ts`, `src/pages/api/admin/items/`,
   `src/pages/admin/items/`, `src/pages/items/`, `src/components/admin/ItemForm.astro`,
   `src/components/admin/ItemImage.tsx`, `src/components/site/ItemCard.astro`.
2. Delete `test/items-repo.test.ts`, `test/api-items.test.ts`,
   `test/api-admin-items.test.ts`, `test/api-admin-item-image.test.ts`,
   `e2e/publish-item.spec.ts`, `e2e/fixtures/photo.png`.
3. Remove the `items` table from `src/db/schema.ts`, delete `migrations/0001_items.sql`
   and `migrations/meta/0001_snapshot.json`, and drop entry `1` from
   `migrations/meta/_journal.json` (only safe before anything is deployed; otherwise
   generate a drop migration).
4. Update `src/lib/admin/nav.ts` (`NavKey`, `NAV`), `src/pages/admin/index.astro`
   (redirect target), `src/pages/index.astro`, `src/pages/sitemap.xml.ts`, and
   `e2e/auth.setup.ts` (landing assertions).
5. Keep `src/lib/form-parse.ts` and `src/lib/media.ts`; trim what you don't use.
6. Run the gate. It should be green with 3 fewer suites and 2 E2E specs.
