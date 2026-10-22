import { NextRequest, NextResponse } from "next/server";
import { pathwayBySlug } from "@/pathway-catalog";
import { ekegusiiSeedDrafts } from "@/ekegusii-seed-drafts";

export const runtime = "nodejs";

// Read-only deterministic translation endpoint; no live model calls or write actions.
export function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !pathwayBySlug(slug)) {
    return NextResponse.json({ error: "Unknown Pathway." }, { status: 404 });
  }
  const draft = ekegusiiSeedDrafts[slug];
  if (!draft) return NextResponse.json({ error: "Translation draft unavailable." }, { status: 404 });
  return NextResponse.json({ language: "guz", approved: false, slug, draft }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
}
