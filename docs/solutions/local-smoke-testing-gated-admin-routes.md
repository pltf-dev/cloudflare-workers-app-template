---
category: learning
tags: [testing, smoke-test, playwright, curl, auth, session, astro, cloudflare, d1, dev, csrf]
component: src/middleware.ts, src/lib/auth/session.ts, src/pages/admin/
symptoms: "can't browser-smoke-check an /admin page under `pnpm dev` (redirects to /login); POSTing to a form endpoint via curl returns 403"
root_cause: session middleware gates /admin* and /api/admin/*; Astro's checkOrigin CSRF guard rejects form POSTs whose Origin header doesn't match the host
---

# Smoke-testing auth-gated /admin routes locally

`AGENTS.md` mandates a browser smoke-check (`pnpm dev` + real browser) before calling a
task done when it touches a page, route or form, because `build`/`test`/`typecheck` miss
SSR and runtime binding failures. For `/admin*` and `/api/admin/*` that means getting
past auth and CSRF first.

## 1. Forge a session in the local D1 (no OTP flow needed)

`src/middleware.ts` reads the session cookie, hashes it and looks up `sessions.token_hash`
with `expires_at > now`. Insert a matching row directly:

```bash
TOKEN="devsmoke0123456789abcdef01234567"     # any string; only its SHA-256 is stored
HASH=$(node -e "process.stdout.write(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "$TOKEN")
NOW=$(node -e "process.stdout.write(String(Date.now()))"); EXP=$((NOW+86400000))
pnpm exec wrangler d1 execute cf-app --local --command \
  "INSERT OR IGNORE INTO users (id,email,created_at) VALUES (1,'smoke@example.com',$NOW);
   INSERT INTO sessions (token_hash,user_id,expires_at,last_seen,created_at) VALUES ('$HASH',1,$EXP,$NOW,$NOW);"
```

Then send the cookie. **On loopback the cookie is `sid`, NOT `__Host-sid`**: the `__Host-`
prefix is only used when `secure` (production). So:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Cookie: sid=$TOKEN" http://localhost:4321/admin/items   # 200
```

`wrangler d1 execute --local` writes the **same** SQLite that `pnpm dev` reads
(`.wrangler/state/v3/d1`), so the row is visible to the running server immediately. In
Playwright: `context.addCookies([{ name: "sid", value: TOKEN, domain: "localhost", path: "/" }])`.
Delete the forged row when done.

## 2. Astro `checkOrigin` → 403 on form POSTs

POSTing to a form endpoint (e.g. `/api/admin/items`) via curl returns **403**, not the
expected redirect. Astro's `security.checkOrigin` (on by default) rejects form-encoded
POSTs whose `Origin` header doesn't match the host. Send a matching Origin:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" \
  -H "Cookie: sid=$TOKEN" -H "Origin: http://localhost:4321" \
  --data-urlencode "title=Smoke" --data-urlencode "status=draft" \
  http://localhost:4321/api/admin/items
```

GET requests are unaffected. `request.formData()` parses `application/x-www-form-urlencoded`
too, so you only need real multipart when testing an upload.

## Prevention / reuse

Keep a throwaway script that forges the session → drives the routes → asserts status +
key content → checks the console for errors → deletes the session. A document 404 you
navigated to on purpose shows up as a console "Failed to load resource" error; filter it.
