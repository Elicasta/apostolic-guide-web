import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  focus: z.string().trim().max(500).optional().default("church, missions, persecution, humanitarian crises, natural disasters, public tragedy, and events where a brief prayerful response could be appropriate"),
  count: z.number().int().min(1).max(8).optional().default(5)
});

type NewsItem = { headline: string; eventSummary: string; sourceTitle: string; sourceUrl: string; publishedAt?: string };

const SOURCES = [
  { title: "The Christian Post", url: "https://www.christianpost.com/rss" },
  { title: "Christianity Today", url: "https://www.christianitytoday.com/news/" }
] as const;

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

function absoluteUrl(value: string, base: string) {
  try { return new URL(value, base).toString(); } catch { return ""; }
}

function parseRss(xml: string, sourceTitle: string, base: string): NewsItem[] {
  const items: NewsItem[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1];
    const field = (name: string) => decode(block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
    const headline = field("title");
    const sourceUrl = absoluteUrl(field("link"), base);
    if (!headline || !sourceUrl) continue;
    items.push({ headline, eventSummary: field("description").slice(0, 650), sourceTitle, sourceUrl, publishedAt: field("pubDate") || undefined });
  }
  return items;
}

function parseChristianityToday(html: string): NewsItem[] {
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const sourceUrl = absoluteUrl(match[1], "https://www.christianitytoday.com/news/");
    if (!sourceUrl.startsWith("https://www.christianitytoday.com/") || !sourceUrl.includes("/")) continue;
    const headline = decode(match[2]);
    if (headline.length < 24 || headline.length > 190 || seen.has(sourceUrl)) continue;
    if (/sign up|subscribe|view all|read more|christianity today/i.test(headline)) continue;
    seen.add(sourceUrl);
    items.push({ headline, eventSummary: "Open the source to review the full report before drafting a response.", sourceTitle: "Christianity Today", sourceUrl });
    if (items.length >= 12) break;
  }
  return items;
}

function score(item: NewsItem, focus: string) {
  const terms = focus.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 3);
  const haystack = `${item.headline} ${item.eventSummary}`.toLowerCase();
  return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid news scan request." }, { status: 400 });

  const results = await Promise.allSettled(SOURCES.map(async (source) => {
    const response = await fetch(source.url, {
      cache: "no-store",
      headers: { "user-agent": "ApostolicGuideStudio/1.0", accept: "application/rss+xml, application/xml, text/html;q=0.9" },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error(`${source.title} returned ${response.status}.`);
    const text = await response.text();
    return text.includes("<item") ? parseRss(text, source.title, source.url) : source.title === "Christianity Today" ? parseChristianityToday(text) : [];
  }));

  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const unique = [...new Map(items.map((item) => [item.sourceUrl, item])).values()]
    .sort((a, b) => score(b, parsed.data.focus) - score(a, parsed.data.focus))
    .slice(0, parsed.data.count);
  const sourceErrors = results.flatMap((result, index) => result.status === "rejected" ? [`${SOURCES[index].title}: ${result.reason instanceof Error ? result.reason.message : "unavailable"}`] : []);

  if (!unique.length && sourceErrors.length === SOURCES.length) {
    return NextResponse.json({ error: "Christian news sources are temporarily unavailable.", sourceErrors }, { status: 502 });
  }
  return NextResponse.json({ items: unique, sources: SOURCES.map((source) => source.title), sourceErrors });
}
