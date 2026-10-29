/** Supported UI locales. To add one: append its code here and add messages/<code>.json. */
export const locales = ["en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (v: string | undefined): v is Locale => !!v && (locales as readonly string[]).includes(v);
