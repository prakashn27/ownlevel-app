# Ownlevel
TypeScript monorepo (pnpm + Turborepo). Postgres with Row-Level Security

## Commits
Always use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(tenancy): add organizations RLS policies`.

## Diagrams
Always use Mermaid (fenced ```mermaid blocks) for diagrams: architecture, flows, sequences, ER models.

## API
REST + OpenAPI (not tRPC/server actions). `packages/sdk` is generated from the spec; don't hand-edit `src/generated`.
