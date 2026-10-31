# Self-hosting Ownlevel

> ## ☁️ Want to skip the ops? Use Ownlevel Cloud
>
> **[Ownlevel Cloud](https://app.ownlevel.app)** is the easiest way to run Ownlevel. Sign up and your white-label agency workspace is ready in minutes, with no servers to maintain:
>
> - Managed hosting, automatic updates, backups and scaling
> - Custom domains with automatic TLS
> - Email delivery, MCP server and OAuth apps preconfigured
> - Commercial (`ee`) plug-ins and support
>
> 👉 **[Start free on Ownlevel Cloud](https://app.ownlevel.app/signup)**
>
> Self-hosting is for teams that need full control over their data and infrastructure, and are comfortable operating Postgres, Node and TLS themselves.

---

## What you are running

| Component | Path | Default port | Role |
| --- | --- | --- | --- |
| Web | `apps/web` (Next.js) | 3100 | UI for every agency host, proxies `/api/*` to the API |
| API | `apps/api` (Hono + Better Auth) | 4000 | REST API, auth, OAuth server for MCP |
| MCP server | `apps/mcp-server` | 4100 | MCP endpoint for AI clients |
| Postgres 17 | | 5432 | System of record, uses Row-Level Security |

```mermaid
flowchart LR
  B[Browser] --> P[Reverse proxy / TLS]
  P --> W[Web :3100]
  P --> M[MCP :4100]
  W -->|"/api/*, /.well-known/*"| A[API :4000]
  M -->|JWKS| A
  A --> PG[(Postgres)]
  M --> PG
```

Tenants are resolved from the `Host` header: each agency lives at `{slug}.<your root domain>`, so you need a wildcard DNS record.

> The core is AGPL-3.0. Anything under `ee/` is under a separate commercial license (see `ee/LICENSE`). If you modify and offer the AGPL code over a network, you must publish your changes.

## Requirements

- A Linux server (or VM) with 2 GB RAM or more
- Node.js **24+** and pnpm **9.15+**
- Postgres **17** (Docker or managed)
- A domain with wildcard DNS, e.g. `ownlevel.example.com` and `*.ownlevel.example.com`
- A reverse proxy that terminates TLS (Caddy, nginx, Traefik) with a wildcard certificate
- Optional: a [Resend](https://resend.com) API key for email

## 1. Get the code

```bash
git clone <your-ownlevel-repo-url>
cd ownlevel
pnpm install
```

## 2. Database

Start Postgres (the repo ships a dev `docker-compose.yml`; change the credentials for anything real):

```bash
docker compose up -d postgres
```

**Use a non-owner role at runtime.** RLS is only enforced for roles that are not the table owner, not superuser and without `BYPASSRLS`. Run migrations with an owner role, and run the API and MCP server with a separate restricted role. See [Architecture](./technical/1_Architecture.md) and [Testing](./technical/8_Testing.md) for the exact role model.

## 3. Configuration

Generate two secrets:

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -base64 48   # PROXY_SHARED_SECRET
```

`apps/api/.env` (replace `example.com` with your domain):

```ini
DATABASE_URL=postgres://ownlevel_app:STRONG_PASSWORD@localhost:5432/ownlevel
BETTER_AUTH_SECRET=<generated>
# The platform origin, NOT the API host
BETTER_AUTH_URL=https://app.example.com
WEB_ORIGINS=https://app.example.com
PLATFORM_ROOT_DOMAIN=example.com
PLATFORM_HOSTS=app.example.com
PROXY_SHARED_SECRET=<generated>
MCP_PUBLIC_URL=https://mcp.example.com/mcp
OAUTH_ISSUER=https://app.example.com/api/auth
OAUTH_JWKS_URL=http://localhost:4000/api/auth/jwks
EMAIL_FROM=noreply@example.com
RESEND_API_KEY=
# Leave OAUTH_OPEN_REGISTRATION unset in production
```

`apps/web/.env.production`:

```ini
API_URL=http://localhost:4000
PROXY_SHARED_SECRET=<same value as the API>
NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN=example.com
```

`NEXT_PUBLIC_*` values are baked in at build time, so set them before building.

The MCP server reads `DATABASE_URL`, `MCP_PUBLIC_URL`, `OAUTH_ISSUER`, `OAUTH_JWKS_URL` and `MCP_PORT` from its environment.

Never commit `.env` files or secrets.

## 4. Migrate

```bash
# use an owner-level DATABASE_URL for this step
pnpm --filter @ownlevel/api db:migrate
```

Run this on every upgrade, **before** starting the new code.

## 5. Build and run

```bash
pnpm build

pnpm --filter @ownlevel/api start          # :4000
cd apps/mcp-server && npx tsx --env-file-if-exists=.env src/server.ts   # :4100 (no start script yet)
pnpm --filter @ownlevel/web start          # :3100
```

Run each process under a supervisor such as systemd or pm2 so they restart on failure and on boot. The API and MCP server are stateless; sessions, OAuth grants and signing keys live in Postgres.

> The reference production deployment targets Cloudflare Workers ([3_Deployment.md](./technical/3_Deployment.md)). The Node entry points above are what `pnpm dev` uses, and are the supported path for self-hosting.

## 6. Reverse proxy and DNS

DNS (all pointing at your server):

| Record | Purpose |
| --- | --- |
| `app.example.com` | Platform app |
| `*.example.com` | Agency workspaces (`{slug}.example.com`) |
| `mcp.example.com` | MCP server |

Wildcard TLS needs a DNS-01 challenge. Example Caddyfile (with your DNS provider's Caddy plugin):

```caddy
app.example.com, *.example.com {
    tls { dns <provider> <token> }
    reverse_proxy localhost:3100
}

mcp.example.com {
    reverse_proxy localhost:4100
}
```

Keep the API (`:4000`) private. Only the web app reaches it, through its same-origin proxy. Make sure the proxy passes the original `Host` header through unchanged.

## 7. Verify

- `https://app.example.com/signup` loads and you can create an agency
- `https://{slug}.example.com/login` shows that agency's branding
- An unknown slug returns "Not found"
- `https://mcp.example.com/healthz` returns `ok`
- An unauthenticated `POST https://mcp.example.com/mcp` returns `401` with a `WWW-Authenticate` header

## Limitations of self-hosting

- Agency **custom domains** rely on Cloudflare for SaaS in the cloud setup. Self-hosted, you must provision DNS and certificates for custom domains yourself.
- Scheduled jobs (domain re-verification, session cleanup) run as Cron Triggers in the cloud. Self-hosted, run them from your own scheduler.
- Without `RESEND_API_KEY`, emails (invites, password resets) are printed to the API console instead of sent.

## Upgrading

```bash
git pull
pnpm install
pnpm --filter @ownlevel/api db:migrate
pnpm build
# restart api, mcp-server and web
```

## Backups

Back up Postgres regularly (`pg_dump` or continuous archiving) and test restores. Also keep `BETTER_AUTH_SECRET` somewhere safe, because losing it invalidates sessions.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login loops or "invalid origin" | `BETTER_AUTH_URL` must be the platform origin; `PLATFORM_ROOT_DOMAIN` and `PLATFORM_HOSTS` match your domain |
| API returns 401 to the web proxy | `PROXY_SHARED_SECRET` is identical in web and API |
| Wrong agency or "Not found" | The proxy must preserve the `Host` header; wildcard DNS exists |
| MCP token rejected | `OAUTH_JWKS_URL` is reachable from the MCP server; `MCP_PUBLIC_URL` matches exactly |
| Tenant data leaking across agencies | The app is connecting as a superuser or table owner; use the restricted role |

## Prefer not to run this yourself?

**[Ownlevel Cloud](https://app.ownlevel.app/signup)** gives you all of the above, managed, from day one.
