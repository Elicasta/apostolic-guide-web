export const canonicalWebsiteUrl = "https://www.apostolicguide.com";
export const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? canonicalWebsiteUrl;
export const appUrl = "https://app.apostolicguide.com";

export function buildDirectAppUrl(path = "/", context?: Record<string, string | undefined>) {
  const url = new URL(path, appUrl);
  url.searchParams.set("source", "website");
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildAppUrl(path = "/", context?: Record<string, string | undefined>) {
  const destination = buildDirectAppUrl(path, context);
  const handoff = new URL("/install-app", websiteUrl);
  handoff.searchParams.set("destination", destination);
  return handoff.pathname + handoff.search;
}

export function buildAppSearchUrl(query: string, context?: Record<string, string | undefined>) {
  return buildAppUrl("/search", { ...context, q: query });
}
