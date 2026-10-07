import type { Locale } from "./config";

export const localizedRoutes = {
  home: { en: "", es: "" },
  search: { en: "search", es: "buscar" },
  pathways: { en: "pathways", es: "rutas" },
  topics: { en: "topics", es: "temas" },
  answers: { en: "answers", es: "respuestas" },
  scriptures: { en: "scriptures", es: "escrituras" },
  objections: { en: "objections", es: "objeciones" },
  library: { en: "library", es: "biblioteca" },
  account: { en: "account", es: "cuenta" },
} as const satisfies Record<string, Record<Locale, string>>;

export type LocalizedRouteKey = keyof typeof localizedRoutes;

export type LocalizedContentType =
  | "pathway"
  | "topic"
  | "answer"
  | "scripture"
  | "objection";

const contentRouteKey: Record<LocalizedContentType, LocalizedRouteKey> = {
  pathway: "pathways",
  topic: "topics",
  answer: "answers",
  scripture: "scriptures",
  objection: "objections",
};

export function getLocalizedBasePath(locale: Locale, route: LocalizedRouteKey): string {
  const segment = localizedRoutes[route][locale];
  return segment ? `/${locale}/${segment}` : `/${locale}`;
}

export function getLocalizedContentUrl({
  locale,
  type,
  slug,
}: {
  locale: Locale;
  type: LocalizedContentType;
  slug: string;
}): string {
  const basePath = getLocalizedBasePath(locale, contentRouteKey[type]);
  return `${basePath}/${encodeURIComponent(slug)}`;
}

/**
 * Compatibility helper for the protected English production experience.
 * Existing English routes remain canonical until the explicit /en cutover.
 */
export function getPublicContentUrl({
  locale,
  type,
  slug,
}: {
  locale: Locale;
  type: LocalizedContentType;
  slug: string;
}): string {
  if (locale === "en") {
    const route = localizedRoutes[contentRouteKey[type]].en;
    return `/${route}/${encodeURIComponent(slug)}`;
  }

  return getLocalizedContentUrl({ locale, type, slug });
}
