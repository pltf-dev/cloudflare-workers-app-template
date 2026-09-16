---
category: learning
tags: [testing, e2e, playwright, astro, islands, hydration, miniflare, d1, vitest, otp]
component: e2e/, playwright.config.ts, astro.config.mjs, vitest.config.ts
symptoms: "E2E inserts vanish from D1 though the dev server reported success; setInputFiles silently uploads nothing; a role/text locator matches two headings; vitest errors on 2 files after adding e2e specs"
root_cause: "Playwright starts webServer BEFORE globalSetup; Astro islands are server-rendered long before they hydrate; string locators are case-insensitive substring matches; vitest's default glob claims e2e/*.spec.ts"
---

# Building the Playwright E2E harness: five traps

From landing the first committed E2E suite (sign-in, returning sign-in, publish an item). Each of
these presented as something other than its actual cause, which is why they're worth
writing down.

## 1. `globalSetup` runs AFTER the web server starts

**Symptom.** `/api/auth/send-code` returned `{ok:true}` and the dev server logged the OTP,
but querying `auth_codes` from the test found zero rows. The table existed and had all
migrations, so it was clearly the right database file.

**Cause.** Playwright launches `webServer` *before* `globalSetup`. The reset in globalSetup
(`rmSync` the state dir, re-apply migrations) therefore deleted the SQLite file out from
under the already-running dev server. Miniflare kept its open handle to the now-unlinked
inode, so its writes went to a file nothing else could see, while `wrangler d1 execute`
read the freshly created one.

**Fix.** Chain the reset onto the server's own command, so ordering is true by construction:

```ts
webServer: { command: `node e2e/prepare-state.ts && pnpm dev --port ${PORT}` }
```

Generalises: **never mutate state a `webServer` owns from `globalSetup`.** The signature —
writes that "succeed" but are invisible to every other reader — is an unlinked inode.

## 2. Isolating local D1/R2 without wiping dev data

`@astrojs/cloudflare` v13 re-exports `persistState` from `@cloudflare/vite-plugin`
(`boolean | { path: string }`). Wiring it to an env var gives the E2E run its own D1 and R2
while leaving `.wrangler/state` untouched:

```js
adapter: cloudflare(
  process.env.E2E_STATE_DIR ? { persistState: { path: process.env.E2E_STATE_DIR } } : {},
),
```

The path layout matches `wrangler --persist-to` (`<dir>/v3/d1/...`), so the same directory
can be migrated and queried with wrangler while the dev server runs against it.

## 3. Astro islands: SSR'd markup exists long before handlers do

**Symptom.** `setInputFiles` on the image uploader threw nothing and uploaded nothing — no
request, no error, no thumbnail.

**Cause.** `ItemImage` is `client:load` React. Astro server-renders it, so the file
input (and its "Add image" label) are in the DOM before hydration. A `change` event
dispatched then lands on a component with no listener and is simply lost.

**Fix.** `<astro-island>` ships with an `ssr` attribute and removes it once hydrated. Wait
for the element to exist *and then* for the attribute to go:

```ts
const island = page.locator("astro-island");
await expect(island).toHaveCount(1);
await expect(island).not.toHaveAttribute("ssr", "");
```

Both waits, in that order. `expect(page.locator("astro-island[ssr]")).toHaveCount(0)` alone
passes trivially while the document is still empty — exactly the moment you must not act.

## 4. `getByRole("heading", { name: "Items" })` matched "No items yet."

`getByText` / `getByRole({ name })` with a **string** is case-insensitive substring
matching. The board's `<h1>Items</h1>` and the empty state's `<h2>No items yet.</h2>` both
matched, and Playwright's strict mode failed the assertion. Force exactness (or a level)
whenever a short label could appear inside prose:

```ts
await expect(page.getByRole("heading", { name: "Items", exact: true })).toBeVisible();
```

Related: assert `naturalWidth` is *not* 0 rather than equal to the fixture's width — that
tests "the image loaded through /media", not the encoder.

## 5. vitest silently adopts `e2e/*.spec.ts`

Adding Playwright specs turned `pnpm test` red with "Test Files 18 passed (20)" and two
unexplained errors: vitest's default include glob is `**/*.{test,spec}.*`, which claims the
Playwright specs and tries to run them in the workers pool. Pin the suite to its own
directory:

```ts
test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/setup.ts"] }
```

## Prevention

- Getting past OTP: the code is only `console.log`'d in dev, so the suite mints its own —
  `HMAC-SHA256(OTP_HMAC_SECRET, "123456")` inserted into `auth_codes`, matching
  `hashCode()` in `src/lib/auth/otp.ts`. It first asserts send-code stored a row (so a
  broken send-code still fails) and then replaces the rows for that email, avoiding a
  `created_at` tie with the app's own row.
- Anything that calls a third-party API from the page under test should be stubbed with
  `page.route`, so the suite is deterministic and offline-safe.
