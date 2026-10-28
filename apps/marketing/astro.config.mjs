import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

const site = process.env.PUBLIC_SITE_URL ?? "https://ownlevel.app";

export default defineConfig({
  site,
  trailingSlash: "never",
  i18n: {
    defaultLocale: "en",
    // `path` is the URL prefix, `codes` the BCP-47 tag used for hreflang.
    locales: ["en", { path: "fr", codes: ["fr-CA"] }],
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: "en", locales: { en: "en", fr: "fr-CA" } },
    }),
  ],
});
