# Ownlevel
TypeScript monorepo (pnpm + Turborepo). Postgres with Row-Level Security

## Repo structure
`apps/marketing` contains the marketing page
`apps/web` contains the web app
`apps/api` contains API server

## Commits
Always use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(tenancy): add organizations RLS policies`.

## Diagrams
Always use Mermaid (fenced ```mermaid blocks) for diagrams: architecture, flows, sequences, ER models.

## Non negligible rules
Make sure no secrets are committed.
