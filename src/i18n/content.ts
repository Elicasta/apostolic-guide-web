import type { Locale } from "./config";

export type TranslationStatus =
  | "not_started"
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "needs_revision";

export type LocalizedText = Partial<Record<Locale, string>>;
export type LocalizedContent<T> = Partial<Record<Locale, T>>;

export function getLocalizedValue<T>(
  values: LocalizedContent<T>,
  locale: Locale,
): T | null {
  return values[locale] ?? null;
}

/**
 * Editorial content never falls back across languages in production.
 * A missing translation is intentionally represented as null.
 */
export function requireLocalizedValue<T>(
  values: LocalizedContent<T>,
  locale: Locale,
): T | null {
  return getLocalizedValue(values, locale);
}
