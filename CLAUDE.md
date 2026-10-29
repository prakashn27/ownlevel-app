# Ownlevel
TypeScript monorepo (pnpm + Turborepo). Postgres with Row-Level Security

## Repo structure
`apps/marketing` contains the marketing page
`apps/web` contains the web app
`apps/api` contains API server

## Localization (apps/web)
Uses `next-intl`, no locale in the URL: the locale is read from the `NEXT_LOCALE` cookie and falls back to `en`. Only `en` is supported today.

**Never hardcode user-facing strings** (text, placeholders, aria-labels, titles) in `apps/web`. Add them to `apps/web/messages/en.json`:
1. Add the key under the nearest namespace (`common`, `auth`, `shell`, `team`, ...). Reuse `common.*` for shared words (Save, Loading…). Keys are camelCase, named by meaning, not by English text.
2. Use `{param}` for dynamic values (never string concatenation) and `<b>{x}</b>` + `t.rich` for markup. Per-agency client label is passed as `label` / `labelLower`.
3. Client components: `const t = useTranslations("ns")` from `next-intl`. Server components: `const t = await getTranslations("ns")` from `next-intl/server`.
4. Keys are type-checked against `en.json` (`pnpm --filter @ownlevel/web typecheck`).

Text from the API (error messages, role names) and user data (agency/client names) is not translated here.

**Adding a language** (e.g. `fr`): add `"fr"` to `locales` in `apps/web/i18n/config.ts`, copy `messages/en.json` to `messages/fr.json` and translate values only (keep keys and `{params}`). Set the `NEXT_LOCALE` cookie to switch; a language picker is not built yet. Use `useFormatter`/`getFormatter` for dates and numbers rather than `toLocaleDateString()`.

## Technical docs (`docs/technical/`)
Read only the doc relevant to the task:
- [1_Architecture.md](docs/technical/1_Architecture.md): stack choices, modular monolith layout, multi-tenancy (agency → client), RLS, database schema.
- [2_Authentication.md](docs/technical/2_Authentication.md): authn/authz, memberships, roles/permissions, sessions, hostnames and custom domains, OAuth apps, MCP token authorization.
- [3_Deployment.md](docs/technical/3_Deployment.md): Cloudflare Workers deployment (web, API, MCP), Hyperdrive, traffic routing, Host-based tenant resolution.
- [4_MCP.md](docs/technical/4_MCP.md): MCP server, tool registry (`packages/ai/tools`), scopes, audit, distributing MCP to client contacts.
- [8_Testing.md](docs/technical/8_Testing.md): RLS tests, API smoke script, manual and Workers runtime checks.

## Commits
Always use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(tenancy): add organizations RLS policies`.

## Diagrams
Always use Mermaid (fenced ```mermaid blocks) for diagrams: architecture, flows, sequences, ER models.

## Non negligible rules
Make sure no secrets are committed.
