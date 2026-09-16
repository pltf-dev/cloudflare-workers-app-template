# Cloudflare Workers app template

A full-stack app template for **Cloudflare Workers**: Astro SSR, D1 + Drizzle, R2,
passwordless email sign-in, tests that run in the real Workers runtime, Playwright happy
paths, Pulumi for the stateful resources, and an agent handbook (`AGENTS.md`) so coding
agents build on it the way its authors do.

Everything here is exercised by its own test suite. A fresh clone is green on the first run.

## Stack

Astro 6 (SSR) · Cloudflare Workers / D1 / R2 · Drizzle ORM · Tailwind 4 · React 19 islands ·
Vitest in workerd (`@cloudflare/vitest-pool-workers`) · Playwright · Pulumi (TypeScript) ·
pnpm · Node 24+.

## Use this template

**GitHub:** click *Use this template*, or

```bash
gh repo create my-app --template <owner>/cloudflare-workers-app-template --clone --private
```

The first push to `main` runs `.github/workflows/template-cleanup.yml`, which renames the
placeholders to your repo name and deletes itself. Cloning by hand instead? Run:

```bash
pnpm rename my-app my-app.example.com      # app name, then your domain
```

That rewrites `cf-app` (Worker, D1, R2 names), `CF App` (display name) and
`cf-app.example.com` everywhere. It is idempotent.

## Local development

```bash
pnpm install                # on a Mac with Homebrew libvips: SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install
cp .dev.vars.example .dev.vars   # then set OTP_HMAC_SECRET (openssl rand -hex 32)
pnpm db:migrate:local       # create the local D1 schema
pnpm dev                    # http://localhost:4321
```

Sign in at `/login` with any email: in dev the code is printed to the terminal instead of
emailed. The first sign-in creates your user. `/admin` is the authenticated area.

## The gate

Every change is validated by all four, in order:

```bash
pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e
```

The E2E run boots its own dev server on port 4399 against a scratch database, so it is
always safe to run.

## What's inside

| Area | Where | Notes |
|---|---|---|
| Auth | `src/lib/auth/`, `src/pages/api/auth/`, `src/pages/login*` | OTP + magic link, sessions, device list, allowlist |
| Middleware | `src/middleware.ts` | Gates `/admin*` and `/api/admin/*` |
| Example resource | `src/db/items.ts`, `src/pages/api/admin/items/`, `src/pages/admin/items/`, `src/pages/items/` | One full vertical slice: copy it, then delete it |
| Media | `src/pages/api/admin/items/[id]/image.ts`, `src/pages/media/` | R2 upload + safe streaming |
| UI | `src/layouts/`, `src/components/`, `src/styles/global.css`, `brand-kit/` | Neutral tokens, admin chrome, error pages |
| Tests | `test/`, `e2e/` | 67 vitest specs against real D1/R2; 3 Playwright flows |
| Infra | `infra/`, `docs/deploying.md` | Pulumi provisions; Workers Builds deploys |
| Agent handbook | `AGENTS.md`, `.claude/skills/`, `docs/solutions/` | Conventions, review skill, feature recipe, postmortems |

## Adding your first feature

Read `docs/adding-a-feature.md`. It walks the `items` slice layer by layer and ends with
the checklist for removing it once your own resource is in place.

## Deploying

`docs/deploying.md`: provision D1/R2 with Pulumi once, set the Worker secrets, connect the
repo to Cloudflare Workers Builds, protect `main` behind the CI checks. No Cloudflare
token is stored in GitHub.

## Localisation

All copy is English and lives next to the markup. To ship in another language, translate
the strings in `src/pages/`, `src/components/` and `src/lib/email/login-code.ts`, and set
`lang` in the two layouts. There is no i18n framework on purpose.

## Licence

MIT. See `LICENSE`.
