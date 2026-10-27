# Ownlevel

The architecture doc is the source of truth for structure: https://claude.ai/artifact/KM8xHpkpjRYBtJ297NS2am

TypeScript monorepo (pnpm + Turborepo). Postgres with Row-Level Security on one hierarchical `organizations` table (platform | partner | client).

## Non-negotiable rules
- No business logic in `apps/*`; adapters call application services in `packages/core`.
- Every business table has `client_id` and `partner_id` and an RLS policy. No query bypasses RLS except platform-admin jobs, which are logged.
- Tenant identity comes from the authenticated token or hostname, never from request bodies or LLM tool arguments.
- Any `client_id` supplied by a partner caller is verified as a child of that partner before use.
- Agents and automations run in workers via events, never on the request path.
- Every LLM call, SMS and email writes a usage ledger entry for the client.
- Branding is runtime config; nothing brand-specific is hard-coded.
- Tools are defined once in `packages/ai/tools`; MCP servers and internal agents only filter and adapt them.
- Destructive or outbound agent actions require human approval and are audit-logged.

## Licensing
Core is AGPL-3.0. Commercial plug-ins live in `ee/` under `ee/LICENSE`; each `ee/*` package sets `"license": "SEE LICENSE IN LICENSE"`. AGPL code must never import from `ee/`.

## Commits
Always use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(tenancy): add organizations RLS policies`.

## Diagrams
Always use Mermaid (fenced ```mermaid blocks) for diagrams: architecture, flows, sequences, ER models.

## API
REST + OpenAPI (not tRPC/server actions). `packages/sdk` is generated from the spec; don't hand-edit `src/generated`.
