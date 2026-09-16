# Cloudflare Workers App Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `cloudflare-workers-app-template` repository described in the spec: an Astro-on-Workers app with OTP auth, D1/R2, an `items` example slice, a real-runtime test harness, Workers Builds deployment docs, and the agent handbook.

**Architecture:** One Astro 6 SSR app deployed as a single Worker. Session middleware gates `/admin*` and `/api/admin/*`. Drizzle repositories are pure functions over `Db`. Every layer is exercised by Vitest in workerd and by Playwright against a scratch D1. The code is ported from FarolImob (`/Users/marceldias/conductor/workspaces/farolimob-v1/philadelphia`, referred to below as `$FAROL`) with tenancy, billing, host routing and pt-BR removed.

**Tech Stack:** Astro 6, `@astrojs/cloudflare` 13, React 19, Tailwind 4, Drizzle ORM 0.45, drizzle-kit, Wrangler 4, `@cloudflare/vitest-pool-workers`, Vitest 4, Playwright 1.6x, Pulumi 3 + `@pulumi/cloudflare` 6, pnpm 11, Node 24+.

**Spec:** `docs/superpowers/specs/2026-09-16-cloudflare-workers-app-template-design.md`

## Global Constraints

- Repo root: `/Users/marceldias/conductor/repos/cloudflare-workers-app-template`. Its own git repo on `main`. Never `git push`.
- Placeholders: app name `cf-app`, display name `CF App`, domain `cf-app.example.com`. Use them literally; `scripts/rename.mjs` (Task 11) rewrites them.
- English everywhere. No pt-BR strings, no FarolImob names, no `tenant` anywhere in code.
- `wrangler.jsonc` never has `main`/`assets`. `database_id` is the UUID-shaped placeholder `00000000-0000-0000-0000-000000000000` until provisioned.
- Bindings via `import { env } from "cloudflare:workers"`; never `Astro.locals.runtime.env`.
- Tests live in `test/**/*.test.ts` and import route handlers directly. No DB mocks.
- Toolchain prefix on the maintainer's Mac for every node/pnpm command: `export PATH="/opt/homebrew/bin:$PATH"; unset -f node npm npx pnpm corepack 2>/dev/null; hash -r;`. First install: `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install`.
- Commit with `gcm "message"` (signed). Run `pnpm typecheck && pnpm test && pnpm build` before every commit; add `pnpm test:e2e` once Task 8 exists.
- Comments: only non-obvious *why*. Keep the load-bearing rationale comments that FarolImob carries on ported code (cookie prefix, magic-link atomic consume, prepare-state ordering); drop everything that narrates.

---

### Task 1: Scaffold, toolchain, health endpoint

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.json`, `astro.config.mjs`, `wrangler.jsonc`, `drizzle.config.ts`, `vitest.config.ts`, `.gitignore`, `.dev.vars.example`, `public/favicon.svg`
- Create: `src/env.d.ts`, `src/db/schema.ts` (empty export placeholder replaced in Task 2), `src/db/client.ts`, `src/lib/http.ts`, `src/pages/api/health.ts`
- Test: `test/setup.ts`, `test/api-health.test.ts`

**Interfaces:**
- Produces: `getDb(d1): Db`, `json(obj, status?)`, `redirect(path)`, `parseId(params, key?)` from `src/lib/http.ts`; `Cloudflare.Env { DB, MEDIA, OTP_HMAC_SECRET, RESEND_API_KEY, AUTH_ALLOWED_EMAILS?, APP_ORIGIN? }`.

- [ ] **Step 1: package.json**

```json
{
  "name": "cf-app",
  "type": "module",
  "private": true,
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "wrangler dev",
    "deploy": "astro build && wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate:local": "wrangler d1 migrations apply cf-app --local",
    "db:migrate:remote": "wrangler d1 migrations apply cf-app --remote",
    "typecheck": "astro check",
    "rename": "node scripts/rename.mjs"
  },
  "dependencies": {
    "@astrojs/cloudflare": "^13.7.0",
    "@astrojs/react": "^5.0.7",
    "@tailwindcss/vite": "^4.3.1",
    "astro": "^6.4.6",
    "drizzle-orm": "^0.45.2",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "tailwindcss": "^4.3.1"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.9",
    "@cloudflare/vitest-pool-workers": "^0.16.15",
    "@cloudflare/workers-types": "^4.20260615.1",
    "@playwright/test": "^1.62.1",
    "@types/node": "^25.9.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "drizzle-kit": "^0.31.10",
    "typescript": "^6.0.3",
    "vitest": "^4.1.9",
    "wrangler": "^4.100.0"
  }
}
```

Copy `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.json`, `drizzle.config.ts` verbatim from `$FAROL`. `.gitignore` = FarolImob's minus the graphify line, plus `infra/.env`.

- [ ] **Step 2: astro.config.mjs** — FarolImob's without the `allowedHosts` block.

- [ ] **Step 3: wrangler.jsonc**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cf-app",
  "compatibility_date": "2025-09-01",
  "compatibility_flags": ["nodejs_compat"],
  // `main` and `assets` are intentionally omitted: the @astrojs/cloudflare v13 adapter
  // writes the resolved deploy config (entrypoint + ASSETS binding) to
  // dist/server/wrangler.json at build time. This file only carries shared metadata
  // and bindings. Adding them back breaks `pnpm build`.
  "observability": { "enabled": true },
  // Uncomment once the zone exists in your Cloudflare account. `custom_domain: true`
  // makes Wrangler create the DNS record and certificate on deploy, and
  // `workers_dev: false` keeps the app off the ungated *.workers.dev URL.
  // "workers_dev": false,
  // "routes": [{ "pattern": "cf-app.example.com", "custom_domain": true }],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "cf-app",
      // Replace with the id Pulumi prints (`infra/pulumi.sh stack output d1DatabaseId`).
      // An identifier, not a secret — it belongs in committed config.
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "cf-app-media" }],
  "vars": {
    // Public origin used in emails (magic link). Dev uses the request origin instead.
    "APP_ORIGIN": "https://cf-app.example.com"
  }
}
```

- [ ] **Step 4: vitest.config.ts** — FarolImob's with bindings reduced to `TEST_MIGRATIONS`, `OTP_HMAC_SECRET: "test-hmac-secret"`, `RESEND_API_KEY: "re_test"`, `APP_ORIGIN: "https://cf-app.example.com"`; no `astro:content` alias.

- [ ] **Step 5: src/env.d.ts**

```ts
/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    userId?: number;
    sessionId?: number;
  }
}

type D1Database = import("@cloudflare/workers-types").D1Database;
type R2Bucket = import("@cloudflare/workers-types").R2Bucket;

// Astro 6 + @astrojs/cloudflare 13 removed `Astro.locals.runtime.env`. Bindings are
// read via `import { env } from "cloudflare:workers"`, typed as `Cloudflare.Env`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    APP_ORIGIN: string;          // var — public origin for links in emails
    OTP_HMAC_SECRET: string;     // secret — HMAC key for login codes
    RESEND_API_KEY: string;      // secret — only used outside DEV
    AUTH_ALLOWED_EMAILS?: string; // optional var — comma-separated allowlist; unset = open signup
  }
}
```

- [ ] **Step 6: src/db/client.ts, src/lib/http.ts, src/pages/api/health.ts, test/setup.ts, test/api-health.test.ts** — copy from `$FAROL` verbatim. `src/db/schema.ts` temporarily: `export {};` — replaced in Task 2. Create `migrations/` with an empty `meta/_journal.json` (`{"version":"7","dialect":"sqlite","entries":[]}`) so `readD1Migrations` finds the directory.

- [ ] **Step 7: .dev.vars.example**

```bash
# Copy to .dev.vars (gitignored). Only OTP_HMAC_SECRET is required for local dev.
OTP_HMAC_SECRET="replace-with: openssl rand -hex 32"
# RESEND_API_KEY="re_..."            # unused in dev: the code is printed to the console
# AUTH_ALLOWED_EMAILS="you@example.com,teammate@example.com"
```

- [ ] **Step 8: Install and run** — `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install`, then `pnpm typecheck && pnpm test && pnpm build`. Expected: 0 errors, 1 test passing, build green.

- [ ] **Step 9: Commit** — `gcm "chore: scaffold Astro on Cloudflare Workers with D1/R2 and workerd tests"`

---

### Task 2: Schema, migration, auth libraries

**Files:**
- Create: `src/db/schema.ts`, `src/db/users.ts`, `src/lib/auth/otp.ts`, `src/lib/auth/session.ts`, `src/lib/auth/allowlist.ts`, `src/lib/auth/complete-auth.ts`, `src/lib/auth/user-agent.ts`, `migrations/0000_init.sql` + meta
- Test: `test/users.test.ts`, `test/auth-otp.test.ts`, `test/auth-magic-link.test.ts`, `test/auth-session.test.ts`, `test/auth-allowlist.test.ts`

**Interfaces:**
- Produces: tables `users`, `sessions`, `authCodes`; `findUserByEmail(db, email)`, `createUser(db, {email, name?})`, `getUserById(db, id)`; otp: `generateCode`, `generateLinkToken`, `hashCode`, `storeCode`, `checkThrottle`, `verifyCode`, `verifyLinkToken`; session: `createSession(db, userId, opts)`, `validateSession(db, token): {userId, sessionId, renewed} | null`, `destroySession`, `listSessions(db, userId)`, `revokeSession(db, userId, id)`, `revokeOtherSessions(db, userId, keepId)`, `serializeSessionCookie`, `parseSessionCookie`, `expireSessionCookie`, `sessionMetaFromRequest`; `isEmailAllowed(allowlist: string | undefined, email): boolean`; `completeAuth(db, email, request, allowlist): {ok:true, sessionToken} | {ok:false}`.

- [ ] **Step 1: Write tests** for users repo (create + find, unique email), otp (port `$FAROL/test/auth-magic-link.test.ts` and the otp assertions from `$FAROL/test/session-service.test.ts` style: throttle after 3, max attempts, replay), session (port `$FAROL/test/admin-auth-middleware.test.ts` DB parts with `userId`), allowlist:

```ts
import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "../src/lib/auth/allowlist";

describe("isEmailAllowed", () => {
  it("allows everyone when the allowlist is unset or blank", () => {
    expect(isEmailAllowed(undefined, "a@b.co")).toBe(true);
    expect(isEmailAllowed("  ", "a@b.co")).toBe(true);
  });
  it("matches case-insensitively and ignores whitespace around entries", () => {
    expect(isEmailAllowed(" A@b.co , c@d.co", "a@b.co")).toBe(true);
    expect(isEmailAllowed("a@b.co", "x@y.z")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failures** (`pnpm test`).

- [ ] **Step 3: Implement.** `schema.ts`:

```ts
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  lastSeen: integer("last_seen", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  userAgent: text("user_agent"),
  location: text("location"),
}, (t) => [index("sessions_user_id_idx").on(t.userId)]);

export const authCodes = sqliteTable("auth_codes", { /* port verbatim from $FAROL incl. comments */ });
```

`otp.ts`, `session.ts` (rename `tenantId` → `userId`), `user-agent.ts` (English label "Unknown device") ported from `$FAROL/src/lib/auth/`. `sessionMetaFromRequest` inlines the geo lookup (`request.cf?.city/country` then `cf-ipcountry`) instead of importing waitlist. `allowlist.ts`:

```ts
export function isEmailAllowed(allowlist: string | undefined, email: string): boolean {
  const entries = (allowlist ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return entries.length === 0 || entries.includes(email.toLowerCase());
}
```

`complete-auth.ts`: find user by email; if none and allowed → create; if none and not allowed → `{ok:false}`; then `createSession(db, user.id, sessionMetaFromRequest(request))`.

`users.ts`: `findUserByEmail`, `getUserById`, `createUser`.

- [ ] **Step 4: Generate migration** — `pnpm db:generate`, rename the SQL file to `0000_init.sql` and update `meta/_journal.json` tag accordingly. Run `pnpm test` → all green.

- [ ] **Step 5: Commit** — `gcm "feat(auth): users, sessions and OTP/magic-link libraries over D1"`

---

### Task 3: Auth endpoints, login page, middleware

**Files:**
- Create: `src/pages/api/auth/send-code.ts`, `verify-code.ts`, `logout.ts`, `src/pages/login/link.ts`, `src/pages/login.astro`, `src/middleware.ts`, `src/lib/auth/paths.ts`, `src/lib/email/login-code.ts`
- Test: `test/api-auth-send-code.test.ts`, `test/api-auth-verify-code.test.ts`, `test/api-auth-logout.test.ts`, `test/login-link.test.ts`, `test/auth-paths.test.ts`

**Interfaces:**
- Produces: `isAdminPath(pathname): boolean`, `isApiPath(pathname): boolean` in `paths.ts`; `sendLoginCode(email, code, loginUrl)` in `email/login-code.ts` (Resend POST); verify-code returns `{ok:true}` + `Set-Cookie` or `{ok:false,error:"invalid_code"|"not_allowed"}`.

- [ ] **Step 1: Tests.** Port `$FAROL/test/api-auth-send-code.test.ts` and `api-auth-verify-code.test.ts` (URL `http://localhost/...`; replace tenant seeding with `users` inserts; the "unknown email" case now asserts a user row is created and a cookie set; add a case with `AUTH_ALLOWED_EMAILS` unset vs. set via the `env` override pattern: the handler accepts an optional `allowlist` in its context for tests). `auth-paths.test.ts`:

```ts
it("gates /admin, /admin/x and /api/admin/x, not /login or /api/auth", () => {
  expect(isAdminPath("/admin")).toBe(true);
  expect(isAdminPath("/admin/items")).toBe(true);
  expect(isAdminPath("/api/admin/items")).toBe(true);
  expect(isAdminPath("/administrator")).toBe(false);
  expect(isAdminPath("/login")).toBe(false);
  expect(isAdminPath("/api/auth/send-code")).toBe(false);
});
```

- [ ] **Step 2: Run, expect failures.**

- [ ] **Step 3: Implement.** `paths.ts`:

```ts
export const isAdminPath = (p: string) =>
  p === "/admin" || p.startsWith("/admin/") || p.startsWith("/api/admin/");
export const isApiPath = (p: string) => p.startsWith("/api/");
```

`send-code.ts`: port, `FROM = "CF App <no-reply@cf-app.example.com>"`, login URL `${origin}/login/link?t=…` where origin = request origin in DEV else `env.APP_ORIGIN`; if `!isEmailAllowed(env.AUTH_ALLOWED_EMAILS, email)` return `{ok:true}` without storing. English email HTML (simple table layout, code + button, "expires in 10 minutes"). `verify-code.ts`: port; on `completeAuth` `{ok:false}` return `{ok:false,error:"not_allowed"}`. `logout.ts`: verbatim. `login/link.ts`: port from `entrar/magico.ts`, redirect to `/admin` or `/login?error=link`.

`middleware.ts`:

```ts
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getDb } from "./db/client";
import { isAdminPath, isApiPath } from "./lib/auth/paths";
import { validateSession, parseSessionCookie, expireSessionCookie, serializeSessionCookie } from "./lib/auth/session";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (!isAdminPath(pathname)) return next();

  const token = parseSessionCookie(context.request.headers.get("cookie") ?? "");
  const session = token ? await validateSession(getDb(env.DB), token) : null;
  const secure = !import.meta.env.DEV;

  if (!session) {
    if (isApiPath(pathname)) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401, headers: { "content-type": "application/json" },
      });
    }
    const next = encodeURIComponent(pathname + search);
    return new Response(null, {
      status: 303,
      headers: { location: `/login?next=${next}`, "set-cookie": expireSessionCookie(secure) },
    });
  }

  context.locals.userId = session.userId;
  context.locals.sessionId = session.sessionId;
  const response = await next();
  if (session.renewed && token) response.headers.append("set-cookie", serializeSessionCookie(token, secure));
  return response;
});
```

`login.astro`: port `entrar.astro` structure with English copy ("Sign in", "Your email", "Send code", "Check your email", "Code", "Verify", "Use another email", link-error notice) and tokens from `global.css` (Task 4 supplies it; import `../styles/global.css` and use `var(--color-*)`). Keep the same-origin `next` guard verbatim. On success always `window.location.href = safeNext` (no signup branch).

- [ ] **Step 4: Run gate** — `pnpm typecheck && pnpm test && pnpm build`.

- [ ] **Step 5: Commit** — `gcm "feat(auth): passwordless login endpoints, magic link and session middleware"`

---

### Task 4: UI base — tokens, layouts, admin chrome, account page, error pages, robots/sitemap

**Files:**
- Create: `src/styles/global.css`, `brand-kit/BRAND.md`, `src/components/ui/{Button,Section,Eyebrow,Toast,Logo}.astro`, `src/components/site/{Header,Footer,ErrorScreen}.astro`, `src/components/admin/AdminHeader.astro`, `src/lib/{toast,header-menu}.ts`, `src/lib/admin/nav.ts`, `src/layouts/{Layout,AdminLayout}.astro`, `src/pages/{404,500}.astro`, `src/pages/robots.txt.ts`, `src/pages/sitemap.xml.ts`, `src/pages/admin/index.astro`, `src/pages/admin/account.astro`, `src/pages/api/admin/sessions/revoke.ts`
- Test: `test/admin-nav.test.ts`, `test/robots-sitemap.test.ts`, `test/api-admin-sessions-revoke.test.ts`

**Interfaces:**
- Produces: `NavKey = "items" | "account"`, `adminNavSections(): NavSection[]`; `AdminLayout` props `{title, eyebrow?, sub?, active?, primary?, docTitle?}`; `Layout` props `{title, description?}`; `renderSitemap(origin, entries)`, `robotsTxt(origin)`.

- [ ] **Step 1: global.css tokens**

```css
@import "tailwindcss";

@theme {
  --color-ink: #14171C;
  --color-ink-2: #23282F;
  --color-accent: #2F6BFF;
  --color-accent-2: #5C8CFF;
  --color-on-accent: #FFFFFF;
  --color-paper: #F6F5F1;
  --color-paper-2: #ECEAE3;
  --color-muted: #5E6672;
  --color-on-dark: #ECEFF4;
  --color-on-dark-dim: #A6AFBC;
  --color-success: #1F5B3F; --color-success-bg: #E8F1EC; --color-success-border: #C2DDCC;
  --color-error: #9A2C20;   --color-error-bg: #FBEAE7;   --color-error-border: #F0C8C1;
  --color-warn: #8A5A12;    --color-warn-bg: #FDF3E2;    --color-warn-border: #F0DCB4;
  --font-display: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-brand: 16px;
}
```

plus the `@layer base` body/heading/focus rules, `.wrap`, `.btn-pill`, `.sr-only`, reduced-motion block from `$FAROL`.

- [ ] **Step 2: Components.** Port `Button` (variants `accent | ghost | outline`; drop `wa`), `Section` (tones `ink | paper | paper-2`), `Eyebrow`, `Toast` (event name `app:toast`, ids `app-toasts`), `Logo` (simple mark: a rounded square with a signal dot, wordmark `CF App`; no `src` prop), `ErrorScreen` (no Beam/MadeBy; static gradient), `header-menu.ts` verbatim, `toast.ts`.
  `nav.ts` without plan gating:

```ts
export type NavKey = "items" | "account";
export interface NavItem { key: NavKey; label: string; href: string }
export interface NavSection { id: "manage" | "settings"; label: string; items: NavItem[] }
const NAV: NavSection[] = [
  { id: "manage", label: "Manage", items: [{ key: "items", label: "Items", href: "/admin/items" }] },
  { id: "settings", label: "Account", items: [{ key: "account", label: "Account", href: "/admin/account" }] },
];
export const adminNavSections = (): NavSection[] => NAV;
export const adminNav = (): NavItem[] => NAV.flatMap((s) => s.items);
```

`AdminHeader.astro`: port, drop plan/tenant lookup and lock icons, logout posts to `/api/auth/logout` then `location.href="/login"`. `AdminLayout.astro`: port, drop the blog footer. `Layout.astro`: `<html lang="en">`, header with Logo + "Sign in"/"Admin" link, footer, Toast. `404/500.astro`: English copy, actions `[{Home, /}, {Sign in, /login}]`.

- [ ] **Step 3: Account page + revoke endpoint.** `admin/account.astro` lists `listSessions(db, userId)` with `describeUserAgent`, marks the current one (`Astro.locals.sessionId`), each row has a form `POST /api/admin/sessions/revoke` with `id`, plus one "Sign out other devices" form with `all=1`. Endpoint: parse form, `revokeSession(db, userId, id)` or `revokeOtherSessions(db, userId, sessionId)`, redirect `/admin/account?saved=1`. Test: seed user + 2 sessions, call `POST` with `locals: { userId, sessionId }`, assert only the other row is gone; revoking another user's session id is a no-op.

- [ ] **Step 4: robots/sitemap.** `robots.txt.ts`: allow `/`, disallow `/admin`, `/api/`, `/login`; `Sitemap:` line. `sitemap.xml.ts`: `/` plus `/items/<id>` for published items (uses `listPublishedItems` — stub the import with an empty array until Task 5, then wire). Tests for both pure functions.

- [ ] **Step 5: Gate + commit** — `gcm "feat(ui): neutral design tokens, layouts, admin chrome and account page"`

---

### Task 5: Items — schema, repository, migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/items.ts`, `migrations/0001_items.sql` + meta
- Test: `test/items-repo.test.ts`

**Interfaces:**
- Produces: `ItemStatus = "draft" | "published"`; `NewItemInput {title, body, status}`; `listPublishedItems(db)`, `listItemsForUser(db, userId)`, `getItem(db, id)`, `getItemForUser(db, userId, id)`, `createItem(db, userId, input): Item`, `updateItem(db, userId, id, input): boolean`, `deleteItem(db, userId, id): boolean`, `setItemImage(db, userId, id, imageKey | null)`.

- [ ] **Step 1: Test** — create/list/update/delete; `listPublishedItems` excludes drafts and orders newest first; `updateItem` for another user's id returns false and changes nothing.
- [ ] **Step 2: Fail.** **Step 3: Implement** schema:

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
}, (t) => [index("items_status_created_idx").on(t.status, t.createdAt)]);
```

Repository as pure functions; `pnpm db:generate` → rename to `0001_items.sql`.
- [ ] **Step 4: Gate + commit** — `gcm "feat(items): schema, migration and repository for the example resource"`

---

### Task 6: Items — admin endpoints, public API, media

**Files:**
- Create: `src/lib/form-parse.ts`, `src/lib/media.ts`, `src/pages/api/items.ts`, `src/pages/api/admin/items/index.ts`, `src/pages/api/admin/items/[id]/index.ts`, `src/pages/api/admin/items/[id]/delete.ts`, `src/pages/api/admin/items/[id]/image.ts`, `src/pages/media/[...key].ts`
- Test: `test/api-items.test.ts`, `test/api-admin-items.test.ts`, `test/api-admin-item-image.test.ts`, `test/media-route.test.ts`

**Interfaces:**
- Produces: `formStr`, `formBool`, `parseItemForm(form): {valid, input: NewItemInput}`; `media.ts`: `contentTypeForKey(key)`, `extensionForType(type) | null`, `MAX_IMAGE_BYTES = 5_000_000`, `imageKeyFor(itemId, ext)`; endpoints take `{ request, params, locals: { userId } }`.

- [ ] **Step 1: Tests.** Public GET returns only published items as `{ok:true, items:[...]}`. Admin create: valid form → 303 to `/admin/items/<id>/edit?saved=1`, row exists; invalid → 303 `/admin/items/new?error=invalid`. Update/delete scoped by `locals.userId`. Image: multipart with a small PNG buffer → object exists in `env.MEDIA` under `items/<id>/`, `imageKey` set, content-type stored as `image/png`; non-image type → `?error=type`; oversize → `?error=size`. Media route: seeded object streams back with derived content-type + `nosniff`; unknown key → 404.
- [ ] **Step 2: Fail. Step 3: Implement** (form POST + redirect pattern from `$FAROL/src/lib/http.ts`). Media route:

```ts
export async function GET({ params }: { params: { key?: string } }) {
  const key = params.key ?? "";
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": contentTypeForKey(key),
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 4: Gate + commit** — `gcm "feat(items): admin form endpoints, public JSON API and R2 media route"`

---

### Task 7: Items — pages

**Files:**
- Create: `src/pages/index.astro`, `src/pages/items/[id].astro`, `src/pages/admin/items/index.astro`, `src/pages/admin/items/new.astro`, `src/pages/admin/items/[id]/edit.astro`, `src/components/admin/ItemForm.astro`, `src/components/admin/ItemImage.tsx` (React island: file input → `fetch` POST multipart → reload), `src/components/site/ItemCard.astro`
- Modify: `src/pages/sitemap.xml.ts` (wire `listPublishedItems`), `src/pages/admin/index.astro` (redirect to `/admin/items`)

- [ ] **Step 1: Build pages** with `AdminLayout` (`active="items"`, `primary={{label:"New item", href:"/admin/items/new"}}` on the list) and the card/form/badge/banner patterns from `$FAROL/docs/creating-an-admin-page.md`. Status badge, `?saved=1` success banner, `?error=` error banner. Public `/` shows published items as cards; `/items/[id]` 404s for drafts (`Astro.response.status = 404` via `404.astro` rewrite: `return Astro.rewrite("/404")`).
- [ ] **Step 2: Browser smoke** — `pnpm dev`, throwaway Playwright script: `/` 200, `/login` 200, `/admin` → 303 `/login?next=%2Fadmin`, `/404` renders, `/api/health` `{status:"ok",db:true}`; forge a session (`docs/solutions/local-smoke-testing-gated-admin-routes.md` recipe with `user_id`) and load `/admin/items`, `/admin/items/new`, `/admin/account`; no console errors.
- [ ] **Step 3: Gate + commit** — `gcm "feat(items): public listing pages and admin CRUD pages"`

---

### Task 8: E2E harness, specs, CI workflow

**Files:**
- Create: `playwright.config.ts`, `e2e/support/{env,db,otp,login,account}.ts`, `e2e/prepare-state.ts`, `e2e/auth.setup.ts`, `e2e/login.spec.ts`, `e2e/publish-item.spec.ts`, `e2e/fixtures/photo.png`, `.github/workflows/ci.yml`

- [ ] **Step 1: Port harness** from `$FAROL/e2e` (`farolimob` → `cf-app` in wrangler commands, emails `e2e-<stamp>@cf-app.test`, English labels from `login.astro`). `auth.setup.ts`: sign in with a fresh email → lands on `/admin/items` with the empty state "No items yet." `login.spec.ts`: visit `/admin/items` cold → `/login?next=%2Fadmin%2Fitems` → code → back to `/admin/items`. `publish-item.spec.ts`: New item → fill title/body → save → set status published → upload `photo.png` (wait for `astro-island` hydration per the harness-traps doc) → visit `/` → title visible → `/items/<id>` shows image with `naturalWidth > 0`.
- [ ] **Step 2: Add** `"test:e2e"` already in scripts; `pnpm exec playwright install chromium` once. Run `pnpm test:e2e` → 3 passing.
- [ ] **Step 3: ci.yml** — FarolImob's `test` and `e2e` jobs only; a header comment explains deploys happen in Workers Builds (link `docs/deploying.md`).
- [ ] **Step 4: Commit** — `gcm "test(e2e): playwright happy paths and GitHub Actions test workflow"`

---

### Task 9: Infra and deployment docs

**Files:**
- Create: `infra/{Pulumi.yaml,index.ts,package.json,tsconfig.json,pulumi.sh,.env.example}`, `docs/deploying.md`

- [ ] **Step 1: Pulumi program** — D1 `cf-app`, R2 `cf-app-media` (location `ENAM` with a comment to change), exports `d1DatabaseId`, `mediaBucket`. `pulumi.sh`: loads `infra/.env` (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PULUMI_CONFIG_PASSPHRASE`, `PULUMI_BACKEND_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) with `set -a; source`, then `pulumi stack select prod --create && pulumi "$@"`. Keep the preview-then-confirm behaviour for `up|destroy|refresh`. `.env.example` documents each var and the `op run --env-file` alternative.
- [ ] **Step 2: docs/deploying.md** — sections: prerequisites; provision with Pulumi and paste `database_id`; set Worker secrets; connect Workers Builds (build command, deploy command, production branch, preview via `wrangler versions upload`); branch protection required checks; custom domain; fallback GitHub Actions deploy job (commented YAML with a scoped, expiring token); why not OIDC (link to `workers-sdk#11434`).
- [ ] **Step 3: Commit** — `gcm "docs(infra): pulumi program and Workers Builds deployment runbook"`

---

### Task 10: Agent handbook, README, skills, solutions

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md` (symlink), `README.md`, `.claude/settings.json`, `.claude/skills/review-pr/SKILL.md`, `.claude/skills/add-feature/SKILL.md`, `docs/adding-a-feature.md`, `docs/creating-an-admin-page.md`, `docs/solutions/README.md`, `docs/solutions/_template.md`, `docs/solutions/{playwright-e2e-harness-traps,drizzle-snapshot-previd-collision,local-smoke-testing-gated-admin-routes,pnpm-install-fails-sharp-global-libvips}.md`

- [ ] **Step 1: AGENTS.md** with the eight sections from the spec, adapted from `$FAROL/AGENTS.md`. `ln -s AGENTS.md CLAUDE.md`.
- [ ] **Step 2: README.md** — what it is, "Use this template" (GitHub button or `gh repo create my-app --template <owner>/cloudflare-workers-app-template --clone`, then `pnpm rename my-app my-app.example.com`), local dev quick start, gate, deployment pointer, localisation note, what to delete (items slice).
- [ ] **Step 3: .claude/settings.json** — `{ "permissions": { "allow": ["Bash(pnpm test*)", "Bash(pnpm typecheck)", "Bash(pnpm build)"] } }`.
- [ ] **Step 4: Skills.** `review-pr` generified (auth boundary bullet now: middleware is the sole gate; media bullet kept; drop pt-BR/Pedro/AI bullets). `add-feature`:

```markdown
---
name: add-feature
description: Add a new resource or feature to this Cloudflare Workers app by following the vertical-slice recipe (schema → migration → repository → endpoint → page → tests → E2E). Use when asked to add a table, endpoint, admin page or public page.
---
# Add a feature
1. Read `docs/adding-a-feature.md` and the `items` slice it walks through.
2. Schema in `src/db/schema.ts`; `pnpm db:generate`; rename the migration to something descriptive.
3. Repository in `src/db/<resource>.ts` — pure functions over `Db`; test first in `test/<resource>-repo.test.ts`.
4. Endpoints under `src/pages/api/...` (admin ones under `api/admin/`, gated by middleware); test with the fake-context pattern.
5. Pages with `AdminLayout` / `Layout`; register admin destinations in `src/lib/admin/nav.ts`.
6. Run the four-step gate; browser smoke anything outside E2E; extend `e2e/` if the flow is central.
7. Write a `docs/solutions/` entry if anything non-obvious was learned.
```

- [ ] **Step 5: docs** — `adding-a-feature.md` (layer-by-layer tour of items + "removing the example" checklist), `creating-an-admin-page.md` (port, English, nav keys), solutions README + template + 4 ported entries (paths updated: `sid` cookie recipe uses `user_id`; wrangler db name `cf-app`).
- [ ] **Step 6: Commit** — `gcm "docs: agent handbook, skills, feature recipe and ported learnings"`

---

### Task 11: Template plumbing — rename script, cleanup workflow, GitHub templates

**Files:**
- Create: `scripts/rename.mjs`, `test/rename-script.test.ts`, `.github/workflows/template-cleanup.yml`, `.github/ISSUE_TEMPLATE/bug.md`, `.github/ISSUE_TEMPLATE/feature.md`, `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] **Step 1: Test** — copy a fixture tree (`fixtures/rename/`: one `.jsonc`, one `.md`, one `.ts` containing `cf-app`, `CF App`, `cf-app.example.com`) to a temp dir, run `renameTree(dir, {name:"acme", display:"Acme", domain:"acme.dev"})`, assert every occurrence replaced, binary/ignored dirs untouched (`node_modules`, `.git`, `dist`), and a second run is a no-op (same content).
- [ ] **Step 2: Implement** `rename.mjs` exporting `renameTree` and running as CLI: `node scripts/rename.mjs <name> [domain] [--display "Name"]`; display defaults to the name title-cased. Order of replacement: domain first, then display name, then app name.
- [ ] **Step 3: template-cleanup.yml**

```yaml
name: template-cleanup
on:
  push:
    branches: [main]
jobs:
  cleanup:
    if: github.event.repository.name != 'cloudflare-workers-app-template'
    runs-on: ubuntu-latest
    permissions: { contents: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: node scripts/rename.mjs "${{ github.event.repository.name }}"
      - run: rm .github/workflows/template-cleanup.yml
      - run: |
          git config user.name github-actions && git config user.email github-actions@github.com
          git add -A && git commit -m "chore: initialise from template" && git push
```

- [ ] **Step 4: Issue/PR templates** — PR template has the gate checklist (typecheck/test/build/e2e/browser smoke/solutions entry).
- [ ] **Step 5: Gate + commit** — `gcm "chore(template): rename script, first-push cleanup workflow and GitHub templates"`

---

### Task 12: Final verification

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e` — all green, capture output.
- [ ] **Step 2:** `grep -ri "farol\|tenant\|pt-BR\|imóve" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs/superpowers .` → only the spec/plan may mention FarolImob.
- [ ] **Step 3:** Fresh-clone check: `git clone . /tmp/cfapp && cd /tmp/cfapp && SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install && pnpm test` green.
- [ ] **Step 4:** Report: repo path, commit list, the `gh repo create` command, and the Workers Builds settings to enter.
