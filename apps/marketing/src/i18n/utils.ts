import { ui, defaultLocale, locales, type Locale } from "./ui";

export const brand = import.meta.env.PUBLIC_BRAND_NAME ?? "Ownlevel";
export const appUrl = import.meta.env.PUBLIC_APP_URL ?? "https://app.ownlevel.app";

export function getLocale(pathname: string): Locale {
  const seg = pathname.split("/")[1];
  return (locales as readonly string[]).includes(seg ?? "") ? (seg as Locale) : defaultLocale;
}

export function useTranslations(locale: Locale) {
  return (key: keyof (typeof ui)["en"]) =>
    (ui[locale][key] ?? ui[defaultLocale][key]).replaceAll("{brand}", brand);
}

// Localized route segments (translated slugs).
export const segments = {
  en: { industries: "industries", blog: "blog" },
  fr: { industries: "secteurs", blog: "blog" },
} as const;

export const home = (l: Locale) => (l === "en" ? "/" : "/fr");
export const industriesIndex = (l: Locale) => `${home(l) === "/" ? "" : home(l)}/${segments[l].industries}`;
export const industryUrl = (l: Locale, slug: string) => `${industriesIndex(l)}/${slug}`;
// Blog is English-only for now; French pages link to the English blog.
export const blogIndex = () => "/blog";
