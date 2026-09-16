import * as cloudflare from "@pulumi/cloudflare";

// Injected by pulumi.sh from infra/.env so it stays out of committed config.
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!accountId) {
  throw new Error("CLOUDFLARE_ACCOUNT_ID is not set. Run pulumi through ./pulumi.sh");
}

// Pulumi owns creation of the stateful resources; wrangler.jsonc references them by
// name/id and Wrangler owns deploys and migrations. Neither tool creates the other's
// resources, so they never fight over ownership.
const db = new cloudflare.D1Database("db", {
  accountId,
  name: "cf-app",
});

// Pick the location hint closest to your users:
// WNAM/ENAM (Americas), WEUR/EEUR (Europe), APAC, OC.
const media = new cloudflare.R2Bucket("media", {
  accountId,
  name: "cf-app-media",
  location: "ENAM",
});

export const d1DatabaseId = db.id;
export const mediaBucket = media.name;
