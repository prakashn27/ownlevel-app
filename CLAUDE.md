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

## Commits
Always use [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary`, e.g. `feat(tenancy): add organizations RLS policies`.

## Diagrams
Always use Mermaid (fenced ```mermaid blocks) for diagrams: architecture, flows, sequences, ER models.

## Non negligible rules
Make sure no secrets are committed.
