# @ownlevel/marketing

this page holds marketing page hosted in https://ownlevel.app

Astro static site for ownlevel.app. No tenant data, no business logic; sign-up links to the app.

- Locales: `en` (default, no prefix) and `fr-CA` (`/fr`). Translated: home + industry pages. Blog is English-only.
- Industry pages: `src/content/industries/{en,fr}/*.md`, linked by `translationKey`; French slugs are translated (`/fr/secteurs/...`).
- UI strings: `src/i18n/ui.ts`. Brand/URLs come from `PUBLIC_*` env (see `.env.example`).
- Add a blog post: `src/content/blog/<slug>.md`.
- Adding an industry: create both `en` and `fr` files with the same `translationKey`.
