import { getRequestConfig } from "next-intl/server";

export const locales = ["tr", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

// Single-locale for now: every request renders in Turkish. When a language
// switcher is added, read the user's choice here instead.
export default getRequestConfig(async () => {
  const locale = defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
