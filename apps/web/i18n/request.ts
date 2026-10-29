import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE } from "./config";

// No locale in the URL: the locale comes from a cookie and falls back to the default.
export default getRequestConfig(async () => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : defaultLocale;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
