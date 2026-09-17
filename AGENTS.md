# AGENTS.md — CF App

Guidance for any coding agent (Claude Code, Codex, Cursor, …) working in this repo.
`CLAUDE.md` is a symlink to this file. Humans: start with `README.md`, then come back.

## What this is

A full-stack web app on **Cloudflare Workers**, created from the
`cloudflare-workers-app-template`. Astro SSR, D1 + Drizzle, R2, passwordless sign-in, and
tests that run inside the real Workers runtime. Single-tenant by design: one deployment,
one set of users. Multi-tenancy is a deliberate future fork, not something to scaffold
speculatively (YAGNI).

- Design spec of the template itself: `docs/superpowers/specs/2026-09-16-cloudflare-workers-app-template-design.md`
- Implementation plans: `docs/superpowers/plans/`
- Past learnings and bug postmortems: `docs/solutions/` (see "Compounding knowledge").
- How to add a feature: `docs/adding-a-feature.md`. How to add an admin page:
  `docs/creating-an-admin-page.md`. How to deploy: `docs/deploying.md`.
- The `items` resource is a **worked example**, not product code. Copy its shape, then
  delete it (`docs/adding-a-feature.md` has the checklist).

## Commands

```bash
pnpm dev                 # local dev server (astro dev; bindings from wrangler.jsonc)
pnpm build               # astro build (must stay green)
pnpm test                # vitest in workerd against real D1/R2 (Miniflare)
pnpm test <name>         # one suite by filename fragment (NOT `pnpm test -- <name>`:
                         #   vitest treats the bare `--` as end-of-options and drops the filter)
pnpm test:e2e            # playwright happy paths; boots its own dev server + scratch D1
pnpm typecheck           # astro check; must report 0 errors
pnpm db:generate         # drizzle-kit generate (after editing src/db/schema.ts)
pnpm db:migrate:local    # apply migrations to the local D1 (required before first `pnpm dev`)
pnpm db:migrate:remote   # apply migrations to the remote D1
pnpm rename <name> [domain]  # rewrite the template placeholders (see README)
```

Local secrets: copy `.dev.vars.example` → `.dev.vars`. Only `OTP_HMAC_SECRET` is needed;
in dev the sign-in code is printed to the console instead of emailed.

## Architecture

One **Astro** app (SSR) deployed as a single Worker.

- **Request flow.** `src/middleware.ts` runs first. For `/admin`, `/admin/*` and
  `/api/admin/*` (`isAdminPath` in `src/lib/auth/paths.ts`) it requires a valid session
  cookie: pages redirect `303` to `/login?next=…`, API routes get `401`. A valid session
  sets `Astro.locals.userId` and `Astro.locals.sessionId`. Everything else is public.
- **Bindings.** Read via `import { env } from "cloudflare:workers"`, typed on
  `Cloudflare.Env` in `src/env.d.ts`. `Astro.locals.runtime.env` no longer exists in
  Astro 7; do not use it.
- **DB.** Cloudflare D1 via Drizzle. Schema in `src/db/schema.ts`; `getDb(env.DB)` in
  `src/db/client.ts`; repositories in `src/db/*.ts` as pure functions taking `Db`.
  Migrations in `migrations/` (generated, then renamed to something descriptive).
- **Auth.** Email OTP + magic link (`src/lib/auth/`). Codes are HMAC-hashed with
  `OTP_HMAC_SECRET`; sessions are random tokens stored as SHA-256, 3-day sliding window,
  `__Host-sid` cookie in production (`sid` on loopback). Unknown emails create a user on
  first sign-in unless `AUTH_ALLOWED_EMAILS` is set. Devices are listed and revocable at
  `/admin/account`.
- **Media.** R2 binding `MEDIA`. Uploads store a fixed safe content-type from an
  allowlist; `/media/[...key]` streams objects with a type derived from the extension
  and `x-content-type-options: nosniff`.
- **UI.** `Layout.astro` (public) and `AdminLayout.astro` (admin chrome). Admin
  destinations live in `src/lib/admin/nav.ts`. Tokens in `src/styles/global.css`, brand
  in `brand-kit/BRAND.md`. React islands only where the page needs interactivity
  (`ItemImage.tsx` is the one example).
- **Email.** Resend, only for the sign-in code (`src/lib/email/login-code.ts`).
- **Infra.** Pulumi (`infra/`) creates D1 and R2 and exports ids; `wrangler.jsonc`
  references them; Wrangler owns deploy and migrations. Deploys run in Cloudflare
  Workers Builds, tests in GitHub Actions. See `docs/deploying.md`.

## Conventions

- **TDD.** Write the failing test, see it fail, implement, see it pass, commit. Tests
  exercise real D1/R2 via `@cloudflare/vitest-pool-workers`. No DB mocks.
- **Endpoint tests** import the route handler and call it with a fake context
  `{ request, params, locals: { userId } }`. See `test/api-admin-items.test.ts`. State
  accumulates across `it` blocks in a file: clean up in `beforeEach`.
- **Repositories** are pure functions over `Db`. Ownership checks (`userId`) belong in
  the repository's `WHERE`, not only in the handler.
- **Form endpoints** (`POST` from an admin page) redirect back with `?saved=1` or
  `?error=<code>`; the page renders the banner. JSON endpoints return `{ ok, ... }`.
- **Small, focused files**, one responsibility each. Follow the patterns already in
  `src/db/`, `src/lib/`, `src/pages/`.
- **DRY, YAGNI.** Don't add features the current plan doesn't call for. No multi-tenant
  scaffolding, no plans/billing, no feature flags "for later".
- **Frontend design.** When creating or restyling any page, layout or form, use the
  `frontend-design` skill if available and follow `brand-kit/BRAND.md`. Use the tokens
  (`var(--color-*)`, `var(--font-*)`, `var(--radius-brand)`), never raw hex. Don't ship
  default browser form markup; use the `.card`, `.field`, `.banner`, `.badge` and
  `.btn-pill` primitives from `global.css`.
- **Comments** explain non-obvious *why* (a workaround, a security property, a trap).
  Never narrate what the code does.
- **Validate every change with the full gate.** A change is done when all four are green,
  in this order:

  ```bash
  pnpm typecheck   # 0 errors
  pnpm test        # vitest against real D1/R2
  pnpm build       # must stay green
  pnpm test:e2e    # playwright happy paths in a real browser
  ```

  Run all four on **every** change. `typecheck`, `test` and `build` can all pass while a
  runtime binding is misconfigured; only a real request against a real page catches
  that class of failure. If a step fails, fix it before moving on. Never report a task
  complete with a red step, and never describe the gate as passing without running it.
- **E2E suite.** `pnpm test:e2e` runs the committed happy paths (first sign-in, returning
  sign-in, create-and-publish an item) from `e2e/`. It starts its own `astro dev` on port
  4399 against a scratch D1 under `.e2e/state`, so it never touches local dev data and
  is safe to run at any time. When a change alters one of those flows, **extend the
  suite in the same commit**; when it adds a flow just as central, add a spec.
- **Browser smoke-check for anything the E2E suite doesn't cover.** When a task touches a
  page, route or form outside those flows, run `pnpm dev`, drive a real browser
  (Playwright MCP or a throwaway script) to the affected page(s), and verify: the route
  returns the expected status (public `200`; `/admin*` without a session → `303` to
  `/login`), the key content renders, and there are no console or runtime errors. To
  reach a gated page, forge a session: `docs/solutions/local-smoke-testing-gated-admin-routes.md`.
  Astro 7 daemonises `astro dev` when it detects an agentic environment, so `pnpm dev`
  returns straight away — use `pnpm exec astro dev status|logs|stop` to drive it, and
  always `stop` when you're done. Anything that needs a foreground server (Playwright's
  `webServer`) must pass `--ignore-lock`.

## Invariants — do not violate

- `wrangler.jsonc` intentionally **omits** `main`/`assets`. The `@astrojs/cloudflare`
  v14 adapter emits `dist/server/wrangler.json` with those at build time. Adding them
  back breaks `pnpm build`.
- `wrangler.jsonc`'s `database_id` is the **D1 id provisioned by Pulumi**. It is an
  identifier, not a secret, and belongs in committed config. The template ships a
  zero placeholder; once provisioned, never blank it back.
- Never commit `.dev.vars` or `infra/.env` (secrets). Both are gitignored.
- `.claude/` is shared and committed (skills, settings). Never put secrets or personal
  data in it; `.claude/settings.local.json` is gitignored for that.
- `/admin*` and `/api/admin/*` are gated **only** by `src/middleware.ts`. Pages and
  handlers may re-check `Astro.locals.userId` for type narrowing, but must not invent a
  second auth mechanism.
- Keep `pnpm typecheck`, `pnpm test`, `pnpm build` **and `pnpm test:e2e`** green before
  considering a task done.

## Compounding knowledge — read before designing

`docs/solutions/` is the repo's institutional memory: bug postmortems and reusable
learnings, one Markdown file per entry, with YAML frontmatter (`category`, `tags`,
`component`, `symptoms`, `root_cause`). Nothing auto-loads it, so it only compounds if
you read it on the way in and write to it on the way out:

- **Before brainstorming a spec or writing/executing a plan**, `grep docs/solutions/` for
  the area you're about to touch (by `component` path or `tags`) and read any matching
  entries.
- **After fixing a non-obvious bug or landing a review with real findings**, add an entry
  (copy `docs/solutions/_template.md`). Keep it focused: problem → root cause → fix →
  prevention.
- Scope split: `docs/superpowers/` holds **specs and plans** (what to build);
  `docs/solutions/` holds **postmortems and learnings** (what went wrong and why).

## Working from a plan

Plans in `docs/superpowers/plans/` are written to be executed task-by-task (checkbox
steps). When handed a plan:

1. Create/confirm a feature branch. Do **not** work on `main` or other in-flight branches.
2. Implement each task's steps in order; run the full gate before each task's commit, then
   commit with the message in the plan.
3. **Do not `git push`** unless explicitly asked. The human maintainer handles pushing and
   PRs.
4. If a plan step conflicts with reality (a dependency moved, an API changed), make the
   minimal correct adjustment and note the deviation; don't silently diverge.

## Machine-specific notes

Put quirks of a particular developer machine here, clearly labelled, so an agent doesn't
mistake them for project rules. Example of the kind of thing that belongs:

> On one maintainer's Mac the `nvm` lazy-load shim is broken in non-interactive shells:
> bare `node`/`pnpm` print `_nvm_lazy_load: command not found`. Prefix commands with
> `export PATH="/opt/homebrew/bin:$PATH"; unset -f node npm npx pnpm corepack 2>/dev/null; hash -r;`.
> Harmless anywhere else.

Toolchain traps that travel with the stack (not with one machine) go in
`docs/solutions/` instead, e.g. `pnpm-install-fails-sharp-global-libvips.md`.
