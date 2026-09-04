import "server-only";
import type { VideoProducerVisualCandidate } from "./video-producer-visuals";

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_LICENSE_PAGE = "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia";
const FETCH_TIMEOUT_MS = 15_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripHtml(value: unknown) {
  return text(value).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function extValue(metadata: Record<string, unknown>, key: string) {
  const row = record(metadata[key]);
  return row.value;
}

export function simplifyCommonsVideoQuery(value: string) {
  const stop = new Set(["the", "and", "with", "from", "into", "that", "this", "natural", "cinematic", "close", "shallow", "depth", "field", "light", "macro"]);
  const terms = value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length >= 3 && !stop.has(term));
  return [...new Set(terms)].slice(0, 5).join(" ");
}

function relevanceScore(query: string, title: string, description: string, index: number) {
  const terms = simplifyCommonsVideoQuery(query).split(/\s+/).filter(Boolean);
  const haystack = `${title} ${description}`.toLowerCase();
  const matches = terms.reduce((count, term) => count + (haystack.includes(term) ? 1 : 0), 0);
  const base = matches >= 2 ? 88 : matches === 1 ? 84 : 78;
  return Math.max(65, base - index * 2);
}

async function commonsQuery(query: string, limit: number) {
  const url = new URL(COMMONS_API);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", `${query} filetype:video`);
  url.searchParams.set("gsrlimit", String(Math.min(12, Math.max(3, limit))));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|mediatype|extmetadata");
  url.searchParams.set("iiurlwidth", "640");
  url.searchParams.set("iiextmetadatafilter", "LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|AttributionRequired");
  url.searchParams.set("origin", "*");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Wikimedia Commons search failed (${response.status}).`);
  const body = record(await response.json());
  const queryBody = record(body.query);
  return Array.isArray(queryBody.pages) ? queryBody.pages.map(record) : [];
}

export async function searchWikimediaCommonsVideos(query: string, options: { limit?: number } = {}) {
  const limit = Math.min(8, Math.max(1, options.limit ?? 6));
  const rawQuery = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (!rawQuery) return [] as VideoProducerVisualCandidate[];
  const simplified = simplifyCommonsVideoQuery(rawQuery) || rawQuery;
  let pages = await commonsQuery(rawQuery, limit).catch(() => [] as Record<string, unknown>[]);
  if (!pages.length && simplified !== rawQuery.toLowerCase()) pages = await commonsQuery(simplified, limit).catch(() => [] as Record<string, unknown>[]);

  return pages.flatMap((page, index): VideoProducerVisualCandidate[] => {
    const imageInfo = Array.isArray(page.imageinfo) ? record(page.imageinfo[0]) : {};
    const mime = text(imageInfo.mime);
    const mediaType = text(imageInfo.mediatype).toUpperCase();
    const downloadUrl = text(imageInfo.url);
    if (!downloadUrl || (!mime.startsWith("video/") && mediaType !== "VIDEO")) return [];
    const title = text(page.title).replace(/^File:/i, "") || `Wikimedia Commons video ${page.pageid ?? index + 1}`;
    const metadata = record(imageInfo.extmetadata);
    const description = stripHtml(extValue(metadata, "ImageDescription"));
    const creator = stripHtml(extValue(metadata, "Artist")) || stripHtml(extValue(metadata, "Credit")) || "Wikimedia Commons contributor";
    const licenseName = stripHtml(extValue(metadata, "LicenseShortName")) || "Wikimedia Commons file license";
    const licenseUrl = text(extValue(metadata, "LicenseUrl")) || COMMONS_LICENSE_PAGE;
    const descriptionUrl = text(imageInfo.descriptionurl) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || "").replace(/ /g, "_"))}`;
    const providerAssetId = String(page.pageid ?? title).slice(0, 180);
    return [{
      id: `wikimedia:${providerAssetId}`,
      beatId: "",
      provider: "upload",
      providerAssetId,
      title,
      previewUrl: text(imageInfo.thumburl) || null,
      sourceUrl: descriptionUrl,
      downloadUrl,
      creator,
      duration: null,
      width: number(imageInfo.width),
      height: number(imageInfo.height),
      score: relevanceScore(rawQuery, title, description, index),
      licenseName,
      licenseUrl,
      metadata: {
        originProvider: "wikimedia-commons",
        query: rawQuery,
        simplifiedQuery: simplified,
        description,
        originalFileUrl: downloadUrl,
        attributionRequired: stripHtml(extValue(metadata, "AttributionRequired")),
        sourcePage: descriptionUrl,
        tags: ["wikimedia-commons", ...simplified.split(/\s+/).filter(Boolean)].slice(0, 12)
      }
    }];
  }).slice(0, limit);
}
