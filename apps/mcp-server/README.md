# mcp-server

MCP server over the shared tool registry (`packages/ai/tools`). One endpoint, `POST /mcp`; tenant context comes from the OAuth access token (Better Auth), never from tool arguments. Deployed as a Cloudflare Worker (`ownlevel-mcp`, `mcp.ownlevel.app`). Design, OAuth flow, testing and production notes: [docs/Technical/4_MCP.md](../../docs/Technical/4_MCP.md).

| File | Role |
| --- | --- |
| `src/worker.ts` | Worker entry (Hyperdrive per-request pool) |
| `src/app.ts` | Routing, config, shared by the Worker and local Node server |
| `src/handler.ts` | MCP protocol (Streamable HTTP), `tools/list` / `tools/call` |
| `src/oauth-auth.ts` | JWT verification (`jose`) + live membership check |
| `src/server.ts` | Local Node server (development only) |
| `src/dev-auth.ts` | Dev-token authenticator, local only |

## Local dev

```bash
pnpm --filter @ownlevel/mcp-server dev      # Node, http://localhost:4100/mcp
pnpm --filter @ownlevel/mcp-server cf:dev   # Workers runtime (workerd), same URL
pnpm --filter @ownlevel/mcp-server test:oauth   # end-to-end OAuth check (needs the API and Postgres running)
```

`MCP_DEV_AUTH=1` also accepts `Authorization: Bearer dev:<userId>:<agencyId>[:scope,scope]` for curl tests. It refuses to start unless the issuer is `localhost`.

## Deploy

`pnpm --filter @ownlevel/mcp-server cf:deploy` (see 3_Deployment.md for the runbook).
