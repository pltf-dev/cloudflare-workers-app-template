---
name: add-feature
description: Add a resource or feature to this Cloudflare Workers app by following the vertical-slice recipe (schema → migration → repository → endpoints → pages → tests → E2E → learnings). Use when asked to add a table, an API endpoint, an admin page or a public page.
---

# Add a feature

The `items` resource is the worked example of every layer. Build new features in the same
order it was built, test-first at each step, and run the full gate before committing.

## Steps

1. **Read first.** `docs/adding-a-feature.md`, then `grep docs/solutions/` for the area
   you're touching (`component` or `tags` in the frontmatter).
2. **Schema.** Add the table to `src/db/schema.ts` with `created_at`/`updated_at` as
   `timestamp_ms` integers and a `user_id` FK when the rows belong to a user. Run
   `pnpm db:generate`, then rename the generated `NNNN_<random>.sql` to something
   descriptive and update the `tag` in `migrations/meta/_journal.json` to match.
3. **Repository.** `src/db/<resource>.ts`: pure functions over `Db`, ownership in the
   `WHERE`. Test first in `test/<resource>-repo.test.ts` (clean tables in `beforeEach`).
4. **Endpoints.** Admin writes under `src/pages/api/admin/<resource>/` (form POST →
   redirect with `?saved=1`/`?error=`; JSON for islands). Public reads under
   `src/pages/api/`. Handlers take `{ request, params, locals: { userId } }`; test them by
   importing the handler (`test/api-admin-items.test.ts` is the pattern). The middleware
   already gates `/api/admin/*`; handlers still return `401` when `locals.userId` is
   missing so tests document the contract.
5. **Pages.** Admin pages use `AdminLayout` (see `docs/creating-an-admin-page.md`) and
   register in `src/lib/admin/nav.ts`. Public pages use `Layout`. Use the tokens and the
   `.card`/`.field`/`.banner`/`.badge` primitives from `global.css`; use the
   `frontend-design` skill when shaping new UI.
6. **Gate.** `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`. Browser-smoke
   every page outside the E2E flows (forge a session per
   `docs/solutions/local-smoke-testing-gated-admin-routes.md`).
7. **E2E.** If the feature is a central user flow, add a spec in `e2e/` mirroring
   `publish-item.spec.ts`.
8. **Learnings.** Anything non-obvious you hit goes in `docs/solutions/` (copy
   `_template.md`).
9. **Commit** with a conventional message (`feat(<area>): …`). Do not push.

## Don'ts

- No DB mocks; tests run against real D1/R2 in workerd.
- No second auth mechanism; `src/middleware.ts` is the gate.
- No `Astro.locals.runtime.env`; bindings come from `import { env } from "cloudflare:workers"`.
- No raw hex colours or default form markup.
- No speculative abstractions for features that aren't asked for.
