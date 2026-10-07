export const locales = ["en", "es"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const legacyEnglishLocale = "en-US";
export const spanishContentLocale = "es-US";

export const localeMeta = {
  en: {
    code: "en",
    contentLocale: legacyEnglishLocale,
    htmlLang: "en",
    name: "English",
    nativeName: "English",
    brandName: "Apostolic Guide",
  },
  es: {
    code: "es",
    contentLocale: spanishContentLocale,
    htmlLang: "es",
    name: "Spanish",
    nativeName: "Español",
    brandName: "Guía Apostólica",
  },
} as const satisfies Record<Locale, {
  code: Locale;
  contentLocale: string;
  htmlLang: string;
  name: string;
  nativeName: string;
  brandName: string;
}>;

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function toContentLocale(locale: Locale): string {
  return localeMeta[locale].contentLocale;
}
