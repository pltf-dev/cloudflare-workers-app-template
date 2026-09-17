/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    userId?: number;
    sessionId?: number;
  }
}

type D1Database = import("@cloudflare/workers-types").D1Database;
type R2Bucket = import("@cloudflare/workers-types").R2Bucket;

// Astro 7 + @astrojs/cloudflare 14 removed `Astro.locals.runtime.env`. Bindings are
// read via `import { env } from "cloudflare:workers"`, which is typed as `Cloudflare.Env`.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    APP_ORIGIN: string;           // var — public origin for links in emails
    OTP_HMAC_SECRET: string;      // secret — HMAC key for login codes
    RESEND_API_KEY: string;       // secret — only used outside DEV
    AUTH_ALLOWED_EMAILS?: string; // optional var — comma-separated allowlist; unset = open signup
  }
}
