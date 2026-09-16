# Cloudflare Workers app template — design

**Status:** approved 2026-09-16.
**Origin:** extracted from FarolImob (`github.com/pltf-dev/farolimob`), generified.

## Goal

A GitHub template repository that a developer (or a coding agent) can instantiate and,
within minutes, have a working full-stack app on Cloudflare Workers with authentication,
a database, object storage, a test harness that runs against the real runtime, and the
agent instructions that made FarolImob productive. Everything in the template is
exercised by its own test suite and gate, so a fresh clone is green on the first run.

The template is opinionated. It is not a menu of options; it is one proven stack with
one proven workflow.

## Non-goals

- Multi-tenancy, host-based routing, billing, plans, CAPTCHA, analytics, AI. All of
  these exist in FarolImob and are deliberately left out. Where a future fork is
  likely (multi-tenant), the doc says so and stops.
- Supporting frameworks other than Astro, or hosts other than Cloudflare Workers.
- pt-BR copy. The template is English; localisation is one paragraph in the README.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| App | Astro 6 SSR, `@astrojs/cloudflare` v13 | Bindings via `import { env } from "cloudflare:workers"`; `Astro.locals.runtime.env` is gone in Astro 6. |
| UI | Astro components, React 19 islands where interactive, Tailwind 4 | Islands only in `/admin`. Public pages ship near-zero JS. |
| DB | Cloudflare D1 via Drizzle ORM | Schema in `src/db/schema.ts`, migrations in `migrations/`, repositories as pure functions over `Db`. |
| Storage | Cloudflare R2, binding `MEDIA` | One upload path and one streaming read route as the worked example. |
| Email | Resend | Only for the login code. Dev logs the code instead of sending. |
| Tests | Vitest in workerd via `@cloudflare/vitest-pool-workers` | Real D1/R2 under Miniflare. No DB mocks. |
| E2E | Playwright | Boots its own `astro dev` on port 4399 against a scratch D1. |
| Infra | Pulumi (TypeScript), R2-backed state | Provisions D1, R2, and optionally DNS. Wrangler owns deploy and migrations. |
| CI | GitHub Actions for tests; **Cloudflare Workers Builds for deploys** | No Cloudflare API token is stored in GitHub. See "Deployment". |

## Repository layout

```
cloudflare-workers-app-template/
├── AGENTS.md                  # the agent handbook; CLAUDE.md is a symlink
├── CLAUDE.md -> AGENTS.md
├── README.md                  # human quick start + "using this template"
├── .claude/
│   ├── settings.json          # shared hooks/permissions (no secrets)
│   └── skills/
│       ├── review-pr/SKILL.md # five-lens PR review, generified
│       └── add-feature/SKILL.md  # the vertical-slice recipe as a skill
├── .github/
│   ├── workflows/ci.yml       # typecheck + test + e2e on PRs and main
│   ├── workflows/template-cleanup.yml  # first-push rename, self-deletes
│   ├── ISSUE_TEMPLATE/{bug.md,feature.md}
│   └── PULL_REQUEST_TEMPLATE.md
├── brand-kit/BRAND.md         # neutral tokens + how to swap them
├── docs/
│   ├── adding-a-feature.md    # walk the items slice layer by layer
│   ├── creating-an-admin-page.md
│   ├── deploying.md           # Workers Builds + Pulumi runbook
│   ├── solutions/             # postmortems: README + template + ported entries
│   └── superpowers/{specs,plans}/
├── e2e/                       # Playwright harness + 3 specs
├── infra/                     # Pulumi program + pulumi.sh wrapper
├── migrations/                # 0000_init.sql + meta/
├── public/favicon.svg
├── scripts/rename.mjs         # replaces the placeholder name/domain
├── src/
│   ├── components/{admin,site,ui}/
│   ├── db/{schema,client,users,items}.ts
│   ├── layouts/{Layout,AdminLayout}.astro
│   ├── lib/{http,form-parse,media,header-menu,toast}.ts
│   ├── lib/auth/{otp,session,complete-auth,allowlist,user-agent}.ts
│   ├── lib/admin/nav.ts
│   ├── middleware.ts
│   ├── pages/...
│   └── styles/global.css
├── test/                      # vitest suites + setup.ts
├── astro.config.mjs, drizzle.config.ts, playwright.config.ts, vitest.config.ts
├── wrangler.jsonc, tsconfig.json, package.json, pnpm-workspace.yaml, .npmrc
└── .dev.vars.example, .gitignore
```

## Placeholders and the rename step

The template ships with a working default identity so every command runs unmodified:

| Placeholder | Default | Used in |
|---|---|---|
| App name | `cf-app` | `wrangler.jsonc` name, D1 name, R2 bucket `cf-app-media`, Pulumi project, package name, E2E wrangler commands |
| Display name | `CF App` | page titles, login email, brand kit |
| Domain | `cf-app.example.com` | `wrangler.jsonc` routes (commented), robots/sitemap, email `from` |

`scripts/rename.mjs <app-name> [domain]` rewrites all three across the repo and is
idempotent. `.github/workflows/template-cleanup.yml` runs once on the first push of a
repo created from the template (guarded by `github.event.repository.name !=
'cloudflare-workers-app-template'`), calls the script with the new repo name, removes
itself, and commits. Anyone cloning by hand runs the script directly.

## Authentication and authorization

Ported from FarolImob's SP-2 design, minus tenancy.

**Tables.** `users(id, email unique, name, created_at)`, `sessions(id, token_hash
unique, user_id, expires_at, last_seen, created_at, user_agent, location)`,
`auth_codes(id, email, code_hash, link_token_hash unique, expires_at, attempts,
used_at, link_used_at, created_at)`.

**Flow.**
1. `POST /api/auth/send-code {email}` → throttled to 3 codes per 15 minutes per email;
   stores HMAC-SHA256(`OTP_HMAC_SECRET`, code) and an independent 128-bit magic-link
   token hash on the same row; sends via Resend in production, logs to stdout in dev.
   Always returns `{ok:true}` (enumeration-safe).
2. `POST /api/auth/verify-code {email, code}` → 6-digit, 3 attempts, 10-minute TTL,
   single use. On success `completeAuth` finds or creates the user and mints a session.
3. `GET /login/link?t=…` → same outcome via the magic link. Consumes only the link
   credential so a mail scanner's prefetch cannot invalidate the typed code. Every
   failure redirects to `/login?error=link` with no distinguishing detail.
4. `POST /api/auth/logout` → deletes the session row and expires the cookie.

**Signup policy.** Unknown emails create a user on first successful verification,
unless `AUTH_ALLOWED_EMAILS` (comma-separated, optional) is set, in which case only
listed addresses can sign in or sign up. Both send-code and verify-code apply the rule;
send-code still returns `{ok:true}` for a disallowed address.

**Sessions.** 3-day sliding window, cookie re-issued at most every 12 hours of activity.
Cookie is `__Host-sid` with `Secure` in production and plain `sid` on loopback. Token is
random 128-bit; only its SHA-256 is stored. `/admin/account` lists the user's sessions
with device label and location, and offers "sign out other devices" and per-session
revoke via `POST /api/admin/sessions/revoke`.

**Middleware.** `src/middleware.ts` gates `isAdminPath()` = `/admin`, `/admin/*`,
`/api/admin/*`. Page requests without a valid session redirect `303` to
`/login?next=<pathname>`; API requests get `401 {ok:false,error:"unauthorized"}`. Valid
sessions set `Astro.locals.userId` and `Astro.locals.sessionId`. The `next` parameter is
only honoured client-side after resolving against the current origin (open-redirect
guard, ported verbatim).

## Example vertical slice: items

One resource that touches every layer, so the recipe for "add a feature" is "copy this".

- **Schema:** `items(id, user_id, title, body, status enum draft|published, image_key,
  created_at, updated_at)`.
- **Repository `src/db/items.ts`:** `listPublishedItems`, `listItemsForUser`,
  `getItem`, `createItem`, `updateItem`, `deleteItem`, `setItemImage`. Pure over `Db`.
- **Public:** `GET /` renders published items; `GET /items/[id]` renders one; `GET
  /api/items` returns published items as JSON.
- **Admin pages:** `/admin/items` (list with status badges and a primary "New item"
  action), `/admin/items/new`, `/admin/items/[id]/edit` (form plus image upload island).
- **Admin API (form POST, redirect back with `?saved=1` or `?error=…`):** `POST
  /api/admin/items`, `POST /api/admin/items/[id]`, `POST /api/admin/items/[id]/delete`,
  `POST /api/admin/items/[id]/image` (multipart, stores to R2 under
  `items/<id>/<random>.<ext>`, fixed safe content-type, size cap).
- **Media:** `GET /media/[...key]` streams from R2 with content-type derived from the
  key's extension and `x-content-type-options: nosniff`.
- **Tests:** repository CRUD; each endpoint via the fake-context pattern; middleware
  decision function; media route content-type and 404.
- **E2E:** signup, login, and "create and publish an item, see it on the public page".

Deleting the slice is documented as a checklist in `docs/adding-a-feature.md`, and
leaves a shell that still passes the gate.

## UI base

- `Layout.astro` (public: head, header, footer, toast host) and `AdminLayout.astro`
  (head, sticky `AdminHeader` with brand, inline nav, account menu, logout; title band;
  one 1080px content column; `scrollbar-gutter: stable`).
- `src/lib/admin/nav.ts` is the single source of truth for admin destinations, grouped
  in sections, without plan gating.
- `components/ui/`: `Button`, `Section`, `Eyebrow`, `Toast`, `Logo`, `ErrorScreen`.
- Branded `404.astro` and `500.astro` that import nothing that can fail.
- `/api/health` returning `{status, db}`; per-host-agnostic `robots.txt` and
  `sitemap.xml` (published items).
- `global.css` tokens: `ink`, `ink-2`, `accent`, `accent-2`, `paper`, `paper-2`,
  `muted`, `on-dark`, `on-dark-dim`, plus success/error/warn triples;
  `--font-display` (serif system stack) and `--font-sans` (system-ui). No external font
  request by default; `brand-kit/BRAND.md` shows how to swap in web fonts and colours.

## Agent instructions

`AGENTS.md` is the template's centre of gravity. Sections, in order:

1. What this is and where to look (spec, plans, solutions).
2. Commands, including the `pnpm test <name>` filter caveat.
3. Architecture: request flow, bindings, repositories, media, auth summary.
4. Conventions: TDD, endpoint test pattern, pure repositories, small files, YAGNI,
   frontend-design skill + brand kit, the four-step gate with the "db:false outage"
   rationale, E2E extension rule, browser smoke-check rule.
5. Invariants: no `main`/`assets` in `wrangler.jsonc`; `database_id` is the provisioned
   id and never a blank; never commit `.dev.vars`; `.claude/` is shared and secret-free;
   the gate stays green.
6. Compounding knowledge: how `docs/solutions/` works, read on the way in, write on
   the way out.
7. Working from a plan.
8. Machine-specific notes: an empty section with the FarolImob nvm quirk as a worked
   example of what belongs there.

`.claude/skills/review-pr` keeps the five lenses (engineering, security, Workers
correctness, frontend, conventions) with the FarolImob-specific bullets removed.
`.claude/skills/add-feature` encodes the vertical-slice order: schema → migration →
repository + test → endpoint + test → page → smoke-check → E2E if the flow is central →
solutions entry if anything non-obvious was learned.

`docs/solutions/` ships with a `README.md` (frontmatter shape, when to write), a
`_template.md`, and the entries that transfer unchanged: Playwright harness traps,
Drizzle snapshot collision, smoke-testing gated routes, and `pnpm install` failing on
sharp with Homebrew libvips.

## Deployment

**Tests run in GitHub Actions; deploys run in Cloudflare Workers Builds.** Cloudflare's
API does not accept OIDC-federated identities from any CI provider (open request in
`cloudflare/workers-sdk#11434`), so the only way to deploy without storing a Cloudflare
credential in the CI system is to let Cloudflare be the deployer.

- `.github/workflows/ci.yml`: `test` (typecheck + vitest) and `e2e` (Playwright with a
  cached browser) on pull requests and pushes to `main`. No deploy job, no secrets.
- Workers Builds, configured once in the dashboard and documented in
  `docs/deploying.md`: connect the repo, production branch `main`, build command
  `pnpm build`, deploy command `pnpm exec wrangler d1 migrations apply cf-app --remote &&
  pnpm exec wrangler deploy`, non-production branches build with `wrangler versions
  upload` for preview URLs. Secrets (`OTP_HMAC_SECRET`, `RESEND_API_KEY`) are Worker
  secrets set with `wrangler secret put`, not build variables.
- Branch protection on `main` requires the `test` and `e2e` checks, which is what makes
  "tests gate deploys" true: nothing reaches `main` without them, and Workers Builds only
  deploys `main`.
- Pulumi runs from a maintainer's machine via `infra/pulumi.sh` (reads `infra/.env`,
  gitignored, from `.env.example`; 1Password `op run` is noted as an alternative). It
  provisions D1 and R2 and prints the D1 id to paste into `wrangler.jsonc`. It never
  runs in CI.
- `docs/deploying.md` also carries the fallback: a commented `deploy` job for GitHub
  Actions with a scoped, expiring `CLOUDFLARE_API_TOKEN`, for anyone who cannot use
  Workers Builds.

## Testing the template itself

The template's own gate must be green before it is called done:

```
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

plus a browser smoke of `/`, `/login`, `/admin` (redirect), `/404`, `/api/health`.
`scripts/rename.mjs` has a unit test that runs it against a fixture tree and asserts
idempotence.

## Open decisions resolved

- **Where it lives:** `~/conductor/repos/cloudflare-workers-app-template`, its own git
  repo. The GitHub repo is created by the maintainer afterwards (`gh repo create
  --template`-ready; mark "Template repository" in settings).
- **Signup:** open by default, closable with `AUTH_ALLOWED_EMAILS`. Simpler than a
  separate signup form and still a real, tested policy.
- **Fonts:** system stacks by default. A template should not make a third-party network
  request on every page load unless the adopter chooses to.
- **Language:** English.
