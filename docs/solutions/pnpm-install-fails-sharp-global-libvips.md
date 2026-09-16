---
category: bug
tags: [toolchain, pnpm, sharp, libvips, homebrew, conductor, worktree, environment]
component: package.json, pnpm-workspace.yaml, README.md
symptoms: "pnpm install fails with `sharp: Please add node-addon-api to your dependencies` / `Attempting to build from source via node-gyp` / `[ELIFECYCLE] Command failed with exit code 1`; pnpm build aborts before Astro runs because its deps-status check re-invokes the failing install; a fresh worktree has no usable node_modules"
root_cause: Homebrew libvips is installed on the machine, so sharp's install/check.js returns useGlobalLibvips() === true and forces a source build instead of using the prebuilt @img/sharp-darwin-arm64 binary; the source build then fails because node-addon-api is not a dependency
---

# `pnpm install` fails on sharp when Homebrew libvips is present

## Problem

In a fresh worktree, `pnpm install` fails and takes `pnpm build` down with it:

```
.../sharp@0.34.5/node_modules/sharp install$ node install/check.js || npm run build
sharp: Attempting to build from source via node-gyp
sharp: Please add node-addon-api to your dependencies
Failed
[ELIFECYCLE] Command failed with exit code 1.
```

`pnpm build` never reaches Astro, because pnpm's deps-status check re-runs `pnpm install`
first and inherits the failure:

```
[ERROR] Command failed with exit code 1: pnpm install
```

This is confusing because the prebuilt binary sharp needs is *already installed*:
`node_modules/.pnpm/@img+sharp-darwin-arm64@0.34.5` is present, and
`require(".../sharp/lib/sharp.js")` loads fine.

## Root cause

sharp is a transitive dependency (Astro's image service) and its install script is
allowed to run — `pnpm-workspace.yaml` lists `sharp: true` under `allowBuilds`.

That script is `node install/check.js || npm run build`. `check.js` exits **1** — thereby
triggering the `npm run build` source-build fallback — when
`require('../lib/libvips').useGlobalLibvips()` is true:

```js
const { useGlobalLibvips } = require('../lib/libvips');
if (useGlobalLibvips() || process.env.npm_config_build_from_source) {
  process.exit(1);
}
```

`useGlobalLibvips()` returns true when it finds a system libvips new enough to build
against. On a Mac with Homebrew that is:

```
$ pkg-config --modversion vips-cpp
8.18.4
```

So sharp *deliberately* prefers compiling against the system libvips over the prebuilt
binary. The compile then fails, because building sharp from source needs
`node-addon-api`, which this project (correctly) does not depend on — it only ever wanted
the prebuilt binary.

The trap: the failure message names `node-addon-api`, which invites you to add a
dependency you don't need. The actual cause is the *presence of Homebrew libvips*.

## Fix

Run the install once with sharp's documented escape hatch, which makes
`useGlobalLibvips()` return false so `check.js` exits 0 and the prebuilt binary is used:

```bash
SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install
```

Afterwards `pnpm build`, `pnpm test` and `pnpm typecheck` all work **without** the
variable — pnpm records that the build script completed, so it isn't re-run.

Do **not** "fix" this by adding `node-addon-api`, by uninstalling Homebrew libvips (other
tooling uses it), or by removing `sharp: true` from `allowBuilds` (that changes committed
config for every environment to work around one machine's state).

## Prevention

- In a **fresh clone or worktree**, the first install is the one that hits this. Use
  `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install` for that first install and the rest of the
  session is normal.
- A green `pnpm build` is not evidence that `pnpm install` works — the deps-status check
  only re-invokes the install when it thinks node_modules is stale. An agent that reports
  "build verified" without ever having a complete node_modules is reporting nothing; check
  that `node_modules/.pnpm` is populated .
- Any machine with Homebrew libvips installed will hit this, so it is not specific to one
  laptop — it travels with the toolchain. That is why it lives here and not in the
  machine-specific section of `AGENTS.md`.
