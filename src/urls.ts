export const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL ?? "https://apostolicguide.com";
export const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.apostolicguide.com";

export function buildAppUrl(path = "/", context?: Record<string, string | undefined>) {
  const url = new URL(path, appUrl);
  url.searchParams.set("source", "website");
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildAppSearchUrl(query: string, context?: Record<string, string | undefined>) {
  const url = new URL("/search", appUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("source", "website");
  for (const [key, value] of Object.entries(context ?? {})) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}
