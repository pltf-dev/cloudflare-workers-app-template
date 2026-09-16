# Deploying

Two tools, two jobs:

| Tool | Owns | Runs where |
|---|---|---|
| **Pulumi** (`infra/`) | Creating D1 and R2 | A maintainer's machine, rarely |
| **Wrangler** (via Workers Builds) | Building, migrating, deploying the Worker, the custom domain | Cloudflare, on every push to `main` |

Tests run in GitHub Actions and gate the merge. Deploys run in **Cloudflare Workers
Builds**, so no Cloudflare credential is ever stored in GitHub.

## 1. One-time provisioning (Pulumi)

1. In the Cloudflare dashboard create an R2 bucket for Pulumi state (e.g.
   `cf-app-pulumi-state`) and an R2 API token with read/write on it.
2. Create a Cloudflare API token with **D1 Edit** and **Workers R2 Storage Edit** on the
   account.
3. `cp infra/.env.example infra/.env` and fill it in (gitignored).
4. Provision:

   ```bash
   cd infra && pnpm install
   ./pulumi.sh up
   ./pulumi.sh stack output d1DatabaseId
   ```

5. Paste the id into `wrangler.jsonc` → `d1_databases[0].database_id` and commit. It is an
   identifier, not a secret, and belongs in the repo.

If you ever destroy and re-create the database, repeat step 4–5. Never blank the id back
to the placeholder.

## 2. Worker secrets

Secrets live on the Worker, not in the build system:

```bash
openssl rand -hex 32 | pnpm exec wrangler secret put OTP_HMAC_SECRET
pnpm exec wrangler secret put RESEND_API_KEY
# optional: lock sign-in to specific addresses
pnpm exec wrangler secret put AUTH_ALLOWED_EMAILS   # "you@example.com,teammate@example.com"
```

The first `wrangler secret put` on a Worker that has never been deployed will offer to
create it; accept.

## 3. Connect Workers Builds

Dashboard → **Workers & Pages → Create → Import a repository**, or on an existing Worker
**Settings → Build**. Use:

| Setting | Value |
|---|---|
| Repository | this repo |
| Production branch | `main` |
| Build command | `pnpm build` |
| Deploy command | `pnpm exec wrangler d1 migrations apply cf-app --remote && pnpm exec wrangler deploy` |
| Non-production branch deploy command | `pnpm exec wrangler versions upload` |
| Root directory | `/` |
| Build variables | none needed (`APP_ORIGIN` comes from `wrangler.jsonc`) |

Migrations run before the deploy so the new code never meets an old schema. Preview
branches get a versioned preview URL without touching production.

Workers Builds authenticates to Cloudflare internally; there is no token to create.

## 4. Make tests gate deploys

Workers Builds deploys whatever lands on `main`. Protect the branch so nothing lands
without the checks:

GitHub → **Settings → Branches → Add rule** for `main`: *Require status checks to pass
before merging* → select `test` and `e2e`. Optionally require a pull request.

## 5. Custom domain

Once the zone is on your Cloudflare account, uncomment in `wrangler.jsonc`:

```jsonc
"workers_dev": false,
"routes": [{ "pattern": "cf-app.example.com", "custom_domain": true }],
```

Wrangler creates the DNS record and certificate on the next deploy. `workers_dev: false`
removes the `*.workers.dev` URL so the app is reachable only on your domain.

## Why not OIDC from CI?

Cloudflare's API does not accept OIDC-federated identities from any CI provider (open
request: [cloudflare/workers-sdk#11434](https://github.com/cloudflare/workers-sdk/discussions/11434)).
Any CI deploy therefore needs a stored Cloudflare API token, however short-lived. Letting
Cloudflare be the deployer removes the credential entirely.

## Fallback: deploying from GitHub Actions

If you cannot use Workers Builds, add this job to `.github/workflows/ci.yml` and create a
Cloudflare API token scoped to **Workers Scripts Edit + D1 Edit** on this account with an
expiry date, stored as the `CLOUDFLARE_API_TOKEN` repository secret (plus
`CLOUDFLARE_ACCOUNT_ID`):

```yaml
  deploy:
    needs: [test, e2e]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate:remote
      - run: pnpm deploy
```

Rotate the token on its expiry; Cloudflare tokens support an end date and an IP
allowlist (useful only with self-hosted runners that have static egress).
