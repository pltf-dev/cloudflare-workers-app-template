// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  // The v14 adapter drives @cloudflare/vite-plugin, which reads wrangler.jsonc and
  // exposes the D1/R2 bindings to `astro dev` by itself.
  // E2E_STATE_DIR redirects the local D1/R2 state (default: .wrangler/state). Only the
  // Playwright suite sets it, so it runs against a scratch database without seeing or
  // corrupting local dev data.
  adapter: cloudflare(
    process.env.E2E_STATE_DIR ? { persistState: { path: process.env.E2E_STATE_DIR } } : {},
  ),
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
