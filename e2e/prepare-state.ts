import { mkdirSync, rmSync } from "node:fs";
import { applyMigrations } from "./support/db.ts";
import { AUTH_DIR, STATE_DIR, resolveOtpSecret } from "./support/env.ts";

/**
 * Build the scratch world a run happens in: a fresh D1, an empty auth dir, and
 * a `.dev.vars` holding an OTP secret this suite knows.
 *
 * Invoked from `webServer.command`, NOT from a Playwright `globalSetup` hook.
 * Playwright starts the web server *before* globalSetup runs, so resetting there
 * deletes the database out from under the already-booted dev server: it keeps
 * writing to the unlinked inode, its inserts vanish, and every OTP lookup comes
 * back empty. Chaining the reset onto the server's own command makes "reset,
 * then boot" true by construction.
 *
 * Deleting on the way in rather than on the way out means a crashed run needs no
 * manual cleanup, and its database survives for post-mortem inspection.
 */
rmSync(STATE_DIR, { recursive: true, force: true });
rmSync(AUTH_DIR, { recursive: true, force: true });
mkdirSync(STATE_DIR, { recursive: true });
mkdirSync(AUTH_DIR, { recursive: true });

resolveOtpSecret();
applyMigrations();

console.log(`[e2e] scratch state ready at ${STATE_DIR}`);
