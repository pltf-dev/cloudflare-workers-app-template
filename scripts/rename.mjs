#!/usr/bin/env node
// Rewrite the template placeholders across the repo.
//
//   pnpm rename <app-name> [domain] [--display "Display Name"]
//
// Idempotent: running it twice, or on a repo that was already renamed, changes nothing.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeOptions, renameContent } from "./rename-content.mjs";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".astro", ".wrangler", ".e2e", "playwright-report", "test-results"]);
// These define or test the placeholders themselves; rewriting them would break the script.
const SKIP_FILES = new Set(["pnpm-lock.yaml", "scripts/rename-content.mjs", "test/rename-content.test.ts"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".astro", ".css", ".md", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".sh", ".example", ".txt", ".svg", ".html"]);

function isTextFile(file) {
  const ext = path.extname(file);
  return TEXT_EXT.has(ext) || path.basename(file).startsWith(".") && !ext;
}

export function renameTree(root, options) {
  const opts = normalizeOptions(options);
  const changed = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(full);
        continue;
      }
      if (!isTextFile(full) || SKIP_FILES.has(path.relative(root, full))) continue;
      const before = readFileSync(full, "utf8");
      const after = renameContent(before, opts);
      if (after !== before) {
        writeFileSync(full, after);
        changed.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return changed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const displayIdx = args.indexOf("--display");
  const display = displayIdx === -1 ? undefined : args.splice(displayIdx, 2)[1];
  const [name, domain] = args;
  if (!name) {
    console.error('usage: pnpm rename <app-name> [domain] [--display "Display Name"]');
    process.exit(2);
  }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const changed = renameTree(root, { name, domain, display });
  console.log(changed.length ? `renamed in ${changed.length} files:\n  ${changed.join("\n  ")}` : "nothing to rename");
}
