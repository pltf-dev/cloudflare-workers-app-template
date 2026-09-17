---
category: learning
tags: [astro, upgrade, playwright, e2e, cloudflare, workers-types, typescript, vite]
component: package.json, playwright.config.ts, vitest.config.ts, tsconfig.json
symptoms: "`Error: Process from config.webServer exited early.` on `pnpm test:e2e`; `astro dev` prints `Dev server running at … (pid …)` and returns immediately; `pnpm typecheck` fails with `Expected 0 arguments, but got 1` on `Buffer.toString(\"hex\")`; vitest warns `Your Vite config uses features that are unsupported by configLoader: 'native' — __dirname`"
root_cause: Astro 7 daemonises `astro dev` whenever `am-i-vibing` detects an agentic environment, and pairs with Vite 8; separately, `@cloudflare/workers-types` v5 adds a global `declare const Buffer: any` that shadows the `Buffer` interface from `@types/node` for every file in the program
---

# Upgrading to Astro 7 on Cloudflare Workers

## Problem

Three failures that look unrelated but all land in the same upgrade:

```
# pnpm test:e2e
[WebServer] $ astro dev --port 4399
[WebServer] {"message":"Dev server running at http://localhost:4399 (pid 95273)…"}
Error: Process from config.webServer exited early.

# pnpm typecheck (only if you also bump @cloudflare/workers-types to v5)
e2e/support/env.ts(53,43) - error ts(2554): Expected 0 arguments, but got 1.

# pnpm test
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`:
  - `__dirname` (vitest.config.ts:6:55). Use `import.meta.dirname` instead
```

## Root cause

**Background dev server.** Astro 7 added a daemonised dev server (`astro dev --background`,
plus `stop`, `status` and `logs` subcommands and an `.astro/` lock file). It opts *itself*
in: `astro/dist/cli/dev/index.js` computes

```js
const agentDetected = !process.env.ASTRO_DEV_BACKGROUND && isRunByAgent();
const wantsBackground = !!flags.background || (agentDetected && !ignoreLock);
```

`isRunByAgent()` is the `am-i-vibing` package, which sniffs `CLAUDECODE` and friends. So
the moment an agent (or any CI runner it recognises) starts the suite, `astro dev`
forks and exits — and Playwright kills the run the instant its `webServer` process exits.
There is no `--foreground` flag; `--no-background` does not help because `agentDetected`
is ORed in separately. The only lever in that expression is `--ignore-lock`.

**`Buffer.toString("hex")`.** `@cloudflare/workers-types` v5 (v4 did not do this) adds
global value declarations for the Node compat shims:

```ts
declare const Buffer: any;
declare const process: any;
```

`tsconfig.json` applies `@cloudflare/workers-types` to the *whole* program, `e2e/` and
`test/` included. The duplicate global `Buffer` suppresses `@types/node`'s `interface
Buffer`, so `randomBytes(32).toString(…)` resolves to `Uint8Array.prototype.toString()`,
which takes no arguments. Nothing about this is Astro 7's doing — it only surfaces
because bumping the adapter pulls a newer Wrangler that *peers* on workers-types v5.

**`__dirname`.** Astro 7 ships Vite 8, whose native config loader cannot evaluate CJS
globals in an ESM config file.

## Fix

Foreground the E2E dev server with `--ignore-lock` (`playwright.config.ts`):

```ts
command: `node e2e/prepare-state.ts && pnpm dev --port ${PORT} --ignore-lock`,
```

Use `import.meta.dirname` in `vitest.config.ts`.

Keep `@cloudflare/workers-types` on **v4**. Wrangler 4.13x asks for `^5` and `pnpm peers
check` will say so, but v5's globals break every Node-side file in the program, and Astro
7 does not need them. The version bumps that the upgrade actually requires are:

```
astro                             ^7.3.3
@astrojs/cloudflare               ^14.3.2   (peers astro ^7.2.0, wrangler ^4.125.0)
@astrojs/react                    ^6.0.6
wrangler                          ^4.133.0
@cloudflare/vitest-pool-workers   ^0.22.0
```

## Prevention

- After the upgrade, **run the whole gate including `pnpm test:e2e`**. `typecheck`, `test`
  and `build` were all green while the E2E suite could not start a server at all.
- `pnpm dev` no longer blocks under an agent. Drive it with `pnpm exec astro dev
  status | logs | stop`, and always `stop` — a stray daemon outlives the session.
- Before bumping `@cloudflare/workers-types` across a major, grep for `Buffer`, `process`
  and other Node globals in `e2e/` and `test/`: the v5 shims win over `@types/node`
  wherever `tsconfig.json` lists workers-types program-wide.
- Astro 7's other breaking changes (Sätteri replacing remark, `@astrojs/db` removal,
  `compressHTML: 'jsx'`, the Rust compiler's stricter HTML) were all no-ops here: the app
  has no Markdown, no `astro:db`, and no markup relying on whitespace between inline
  elements. Re-check them against your own pages, not against this note.
