# Ownlevel — Deployment & Traffic Routing

Status: draft · Related: [2_Authentication.md](./2_Authentication.md) (hostnames, custom domains, sessions), [4_MCP.md](./4_MCP.md)

## Overview

Everything runs on Cloudflare Workers. There are no servers, containers or reverse proxies to operate. Tenant identity comes from the `Host` header, so any Worker instance can serve any request.

| Component | Where | Route | Config |
| --- | --- | --- | --- |
| Web (`apps/web`, Next.js via `@opennextjs/cloudflare`) | Worker `ownlevel-web` | `app.ownlevel.app`, `*.ownlevel.app`, custom agency domains | `apps/web/wrangler.jsonc` |
| API (`apps/api`, Hono + Better Auth) | Worker `ownlevel-api` | `api.ownlevel.app` | `apps/api/wrangler.jsonc` |
| MCP server (`apps/mcp-server`) | Worker `ownlevel-mcp` | `mcp.ownlevel.app` | `apps/mcp-server/wrangler.jsonc` |
| Postgres (system of record, RLS) | Managed Postgres reached through Hyperdrive | | Hyperdrive config `ownlevel-db` |

The API and MCP Workers connect as a non-owner database role (not superuser, no `BYPASSRLS`), so RLS always applies. Each request opens its own short-lived pool; Hyperdrive does the real pooling.

```mermaid
flowchart LR
  B[Browser / agency host] --> W["web Worker<br/>app.ownlevel.app, *.ownlevel.app"]
  W -->|"/api/*, /.well-known/* + proxy secret"| A["API Worker<br/>api.ownlevel.app"]
  C[MCP client] -->|"/mcp, Bearer JWT"| M["MCP Worker<br/>mcp.ownlevel.app"]
  C -->|"OAuth: authorize, token, register"| W
  M -->|JWKS| A
  A --> H[Hyperdrive]
  M --> H
  H --> PG[(Postgres)]
```

## DNS and certificates

Every agency gets `{slug}.ownlevel.app` and may add custom domains (see the Authentication doc). All records are proxied (orange cloud) in the single zone `ownlevel.app`; the Worker routes answer before any origin is contacted, so records for hosts with a Worker route can point at a dummy address (`100::` or `192.0.2.1`).

| Hostname | Served by | Certificate |
| --- | --- | --- |
| `app.ownlevel.app` | web Worker | Universal SSL (covered by `*.ownlevel.app`) |
| `*.ownlevel.app` (agency slugs) | web Worker | Universal SSL covers one label, so flat slugs need no extra certificate |
| `api.ownlevel.app` | API Worker | Universal SSL |
| `mcp.ownlevel.app` | MCP Worker | Universal SSL |
| `app.youragency.com` (custom) | web Worker, via CNAME to `domains.ownlevel.app` | Cloudflare for SaaS Custom Hostnames (registered by the domain worker after TXT verification) |

**Route precedence.** The web Worker's `*.ownlevel.app/*` route also matches `api.` and `mcp.`. The API and MCP Workers use routes (not custom domains) with more specific patterns (`api.ownlevel.app/*`, `mcp.ownlevel.app/*`), and Cloudflare picks the most specific route. Do not turn them into custom domains: routes beat custom domains, so the wildcard would win. Every one of these hosts needs a proxied DNS record, otherwise the route never runs.

## Application rules

- State never lives in Worker memory. Sessions, OAuth grants and signing keys are in Postgres; an isolate can be recycled at any time.
- The API honours `X-Forwarded-Host` only when `X-Ownlevel-Proxy` carries the shared secret (`PROXY_SHARED_SECRET`, identical on the web and API Workers). Otherwise the `Host` header wins.
- Scheduled jobs (domain re-verification every 6 hours, session cleanup) run as Cron Triggers so each runs once.
- Migrations run as a single one-off job per release (`pnpm --filter @ownlevel/api db:migrate`), never at Worker start.
- Secrets are Worker secrets (`wrangler secret put`), never in `wrangler.jsonc` `vars` or the repo.

## Web Worker

The Next.js app runs as one Worker for every hostname: the platform host, `{slug}.ownlevel.app` and agencies' custom domains.

- **Same-origin proxy.** The browser only talks to its own host. `app/api/[...path]/route.ts` and `app/.well-known/[...path]/route.ts` forward `/api/*` and `/.well-known/*` to `API_URL`, adding `X-Forwarded-Host` and `X-Ownlevel-Proxy: <secret>` (shared code in `lib/api-proxy.ts`). Cookies stay first-party and host-only, and there is no CORS.
- **Trust.** Better Auth's origin check accepts an origin only if its host resolves to the platform or an active agency domain.
- **Config.** `apps/web/wrangler.jsonc` holds routes and `API_URL`; `PROXY_SHARED_SECRET` is a Worker secret. `NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN` is a build-time variable.
- **Why OAuth lives on `app.ownlevel.app`.** The login session cookie is host-only on the web hosts, so the MCP authorization server must be served from there (through the proxy above) to see it. See [4_MCP.md](./4_MCP.md#production).

## API Worker

`apps/api/src/worker.ts` wraps the Hono app with `runWithDb` (a per-request pool from Hyperdrive).

- **Vars** (`wrangler.jsonc`): `BETTER_AUTH_URL=https://app.ownlevel.app` (the platform origin, **not** `api.`), `MCP_PUBLIC_URL=https://mcp.ownlevel.app/mcp`, `PLATFORM_ROOT_DOMAIN`, `PLATFORM_HOSTS`, `EMAIL_FROM`.
- **Secrets**: `BETTER_AUTH_SECRET`, `PROXY_SHARED_SECRET`, `RESEND_API_KEY`.
- **Hyperdrive**: create with `wrangler hyperdrive create ownlevel-db --connection-string="postgres://ownlevel_app:...@host:5432/ownlevel"` and paste the id into `wrangler.jsonc`.

## MCP Worker

`apps/mcp-server/src/worker.ts` serves `POST /mcp`, `/healthz` and the protected-resource metadata. It verifies OAuth access tokens against the API's public keys, so it has no secrets.

- **Vars**: `MCP_PUBLIC_URL`, `OAUTH_ISSUER=https://app.ownlevel.app/api/auth`, `OAUTH_JWKS_URL=https://api.ownlevel.app/api/auth/jwks`.
- **Hyperdrive**: the same config as the API.
- `global_fetch_strictly_public` is set so the JWKS fetch to our own zone goes out over the public route instead of resolving to the zone's origin.

## Deploy runbook

1. In Cloudflare, create the single zone `ownlevel.app`.
2. Create the Hyperdrive config and put its id in `apps/api/wrangler.jsonc` and `apps/mcp-server/wrangler.jsonc`.
3. DNS (all proxied): `app`, `*`, `api`, `mcp` and `domains`.
4. Secrets: `pnpm wrangler secret put BETTER_AUTH_SECRET` and `PROXY_SHARED_SECRET` in `apps/api`, and `PROXY_SHARED_SECRET` in `apps/web` (same value), plus `RESEND_API_KEY`.
5. Run migrations as a one-off job: `pnpm --filter @ownlevel/api db:migrate`.
6. Deploy, API first, then MCP, then web:
   ```bash
   pnpm --filter @ownlevel/api cf:deploy
   pnpm --filter @ownlevel/mcp-server cf:deploy
   NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN=ownlevel.app pnpm --filter @ownlevel/web cf:deploy
   ```
7. Smoke test (see [8_Testing.md](./8_Testing.md)): `app.ownlevel.app/signup` works, a new agency's `{slug}.ownlevel.app/login` shows its branding, an unknown slug returns "Not found", `https://mcp.ownlevel.app/healthz` returns `ok`, and an unauthenticated `POST /mcp` returns 401 with a `WWW-Authenticate` header.
8. Custom domains: enable Cloudflare for SaaS on `ownlevel.app`, set the fallback origin to `domains.ownlevel.app`, and give the domain worker an API token that can manage Custom Hostnames. Check Cloudflare's "Workers as origin for custom hostnames" guidance for the `*/*` route in `apps/web/wrangler.jsonc`.

## Continuous deployment

GitHub Actions deploys each Worker on push to `main` when its folder changes (or manually with "Run workflow"). Each workflow typechecks the app and its workspace dependencies, then runs `wrangler deploy`. Runs of the same workflow never overlap.

| Workflow | Deploys | Runs when these change |
| --- | --- | --- |
| `deploy-web.yml` | web Worker | `apps/web/**`, `packages/**`, `pnpm-lock.yaml` |
| `deploy-api.yml` | API Worker | `apps/api/**`, `packages/**`, `pnpm-lock.yaml` |
| `deploy-mcp.yml` | MCP Worker (also runs `cf:dry` first) | `apps/mcp-server/**`, `packages/**`, `pnpm-lock.yaml` |
| `deploy-marketing.yml` | marketing Worker | `apps/marketing/**`, `pnpm-lock.yaml` |

Repository secrets: `CLOUDFLARE_API_TOKEN` (permission "Edit Cloudflare Workers", plus Hyperdrive read) and `CLOUDFLARE_ACCOUNT_ID`. Worker runtime secrets (`BETTER_AUTH_SECRET`, `PROXY_SHARED_SECRET`, `RESEND_API_KEY`) stay in Cloudflare and are not part of CI.

Database migrations are **not** run by these workflows. When a change adds a migration (`apps/api/drizzle/`), run `pnpm --filter @ownlevel/api db:migrate` before merging, so the new code never meets the old schema. Because a change under `packages/**` redeploys the API, MCP and web Workers together, they always ship the same version of shared code.

## Local preview in the Workers runtime

The web and MCP Workers have a `preview` environment with no routes, because `wrangler dev` otherwise rewrites `Host` to the first route's hostname and breaks tenant resolution. The API's `cf:dev` runs it as configured.

```bash
pnpm --filter @ownlevel/web cf:preview
pnpm --filter @ownlevel/api cf:dev            # :4000
pnpm --filter @ownlevel/mcp-server cf:dev     # :4100, talks to the local API and Postgres
```

For day-to-day work, `pnpm dev` runs the API and MCP server as plain Node processes (`tsx`) against the local Postgres from `docker-compose.yml`. That is for local development only; nothing in production runs on Node.

## Backups and recovery

- Postgres is a managed service: enable point-in-time recovery, and test a restore monthly.
- Losing a Worker deployment loses nothing: no state lives there. Redeploy from git.
- Signing keys (`jwks` table) and OAuth grants are in Postgres, so they are covered by the same backups. Restoring an old backup invalidates tokens issued after it.
