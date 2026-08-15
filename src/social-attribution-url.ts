export function attributedDestination(destinationUrl: string | null | undefined, token: string | null | undefined) {
  const raw = destinationUrl?.trim();
  if (!raw) return null;
  if (!token) return raw;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host === "apostolicguide.com" || host.endsWith(".apostolicguide.com")) {
      url.searchParams.set("agp", token);
      if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "instagram");
      if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "social_automation");
      return url.toString();
    }
  } catch {}
  return raw;
}
