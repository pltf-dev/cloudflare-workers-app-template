---
name: review-pr
description: Review PRs for this Cloudflare Workers app across five dimensions — software engineering quality, security, Cloudflare Workers correctness, frontend design/usability, and project conventions. Use when reviewing a PR, checking a diff, or validating code before merge.
---

# PR review

Multi-dimensional review for changes to this Astro + Cloudflare Workers app. Reviews the
diff against five lenses, reports only findings with real impact, and ends with a verdict.

## Setup

1. **Get the diff.** PR number/URL: `gh pr diff <n>`. Feature branch: `git diff main...HEAD`.
   Unstaged: `git diff`.
2. **Read the full files** touched by the diff, not just the hunks.
3. **Read references as needed:** `AGENTS.md` (conventions, invariants),
   `brand-kit/BRAND.md`, `src/styles/global.css`, `docs/solutions/` entries whose
   `component` matches the touched paths.

## Dimensions

Skip a dimension entirely if the diff has zero relevance to it. Silence means it passed.

### 1. Software engineering

- **Correctness:** logic bugs, null paths, unhandled rejections, off-by-one.
- **Types:** no `any`; schema ↔ handler ↔ form drift (multipart `name=` must match the
  parsed keys; absent checkbox means false).
- **Testing:** new behaviour has a test against real D1/R2 (no mocks); names describe
  behaviour; `beforeEach` cleanup where empty-state assertions exist.
- **Repositories:** pure over `Db`, ownership (`userId`) enforced in the `WHERE`.
- **YAGNI / DRY:** no speculative abstraction, no multi-tenant scaffolding; reuse
  `src/lib/http.ts` (`json`/`redirect`/`parseId`) and `src/lib/form-parse.ts`.
- **React islands:** immutable state updates; async work in `try/finally` so busy flags reset.

### 2. Security

- **Auth boundary:** `/admin*` and `/api/admin/*` are gated by `src/middleware.ts` only.
  Handlers may `401` on missing `locals.userId` but must not add a second mechanism. Any
  change to `isAdminPath` needs a test.
- **Sessions/OTP:** tokens hashed at rest; codes constant-time compared; magic-link
  failures indistinguishable; `next` redirects resolved against the current origin.
- **Injection:** Drizzle parameterised queries only; no `set:html` with user data.
- **Input validation:** every external input (form, JSON, params, query) validated before use.
- **Media:** uploads store a fixed content-type from the allowlist, never the uploader's
  MIME; `/media/[...key]` derives type from the extension and sends `nosniff`; keys
  can't traverse; old objects are deleted on replace/delete.
- **Secrets:** nothing hardcoded; `.dev.vars`/`infra/.env` untouched; `wrangler secret put` for prod.

### 3. Cloudflare Workers

- **Bindings over REST:** D1/R2 bindings, never the Cloudflare REST API from inside the Worker.
- **Astro 6 binding access:** `import { env } from "cloudflare:workers"`; never
  `Astro.locals.runtime.env`. Tests use the real `cloudflare:test` env.
- **Streaming:** R2 bodies stream; no `await .text()` on unbounded data.
- **waitUntil** for post-response work (email, analytics).
- **D1 limits:** no N+1 in loops; batches ≤ 100 statements.
- **wrangler.jsonc:** no `main`/`assets`; `database_id` never blanked; `compatibility_date` recent.

### 4. Frontend design and usability

- **Tokens, not hex:** `var(--color-*)`, `var(--font-*)`, `var(--radius-brand)`.
- **Primitives:** `.card`, `.field`, `.banner`, `.badge`, `.btn-pill` from `global.css`;
  admin pages use `AdminLayout` and register in `src/lib/admin/nav.ts`.
- **Mobile-first:** touch targets ≥ 44px; forms usable at 375px; no horizontal scroll.
- **Accessibility:** semantic HTML, heading hierarchy, labels bound to inputs, `alt`,
  visible focus, contrast.
- **CSS imports** in frontmatter, never raw `<link href="/src/styles/…">`.
- **Performance:** public pages ship near-zero JS; islands only in `/admin`; images sized
  and lazy.

### 5. Project conventions

- Small, focused files; one responsibility each.
- Schema edits ship with their migration (renamed descriptively, journal tag updated).
- Copy is English, plain, sentence case.
- The four-step gate was run (typecheck, test, build, test:e2e); flows outside E2E were
  browser-smoked; `docs/solutions/` got an entry if something non-obvious was learned.

## Output format

```markdown
## PR Review: <title>

**Verdict:** APPROVE | REQUEST CHANGES | COMMENT

### Findings

#### [Dimension] Finding title
- **Severity:** critical | warning | nit
- **File:** `path/to/file.ts:42`
- **Issue:** <what's wrong>
- **Fix:** <what to do>

### Summary
<1-3 sentences>
```

Severity: **critical** blocks merge (correctness, security, data loss, build); **warning**
should fix before merge; **nit** optional.

## Behavioural rules

- No false positives over silence. Say when you're unsure.
- Read the full file before reporting a finding.
- Acknowledge what's done well, briefly. Don't invent findings.
- One pass, all dimensions.
- Be specific: paths, lines, concrete fixes.
