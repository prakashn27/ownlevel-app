# mcp-server

Two MCP endpoints over one tool registry (packages/ai/tools): /mcp/client (tenant from token) and /mcp/partner (client_id verified as child of token's partner). Every partner call audit-logged.

## Local dev

`pnpm --filter @ownlevel/mcp-server dev` serves `http://localhost:4100/mcp` (needs Postgres; `DATABASE_URL` defaults to the docker-compose one).

Until Better Auth OAuth is wired, auth is a dev-only token (refused when `NODE_ENV=production`):
`Authorization: Bearer dev:<userId>:<agencyId>[:scope,scope]`. The user must have an agency-level membership; role is still enforced by core. Default scope is `agency:settings`.
