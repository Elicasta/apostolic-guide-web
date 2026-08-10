import { NextResponse } from "next/server";
import { getAdminAccess } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { createServiceClient } from "@/supabase";
import { answers, articles, pathways, scriptures, topics } from "@/data";

export type CommandSearchResult = {
  id: string;
  label: string;
  description: string;
  type: "person" | "article" | "answer" | "topic" | "pathway" | "scripture" | "journey";
  href: string;
};

function includesQuery(values: Array<string | null | undefined>, query: string) {
  return values.some((value) => String(value ?? "").toLowerCase().includes(query));
}

export async function GET(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.role) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (query.length < 2) return NextResponse.json({ results: [] });

  const results: CommandSearchResult[] = [];
  const push = (item: CommandSearchResult) => { if (results.length < 16) results.push(item); };

  if (hasStudioPermission(access.role, "view_people")) {
    const service = createServiceClient();
    if (service) {
      const { data } = await service.from("people").select("id,display_name,email,instagram_username,status").limit(250);
      for (const person of data ?? []) {
        if (!includesQuery([person.display_name, person.email, person.instagram_username, person.status], query)) continue;
        const label = person.display_name || (person.instagram_username ? `@${person.instagram_username}` : person.email) || "Unknown person";
        push({ id: `person:${person.id}`, label, description: [person.email, person.status].filter(Boolean).join(" · "), type: "person", href: `/admin/people/${person.id}` });
      }
    }
  }

  const siteItems: CommandSearchResult[] = [
    ...articles.map((item) => ({ id: `article:${item.slug}`, label: item.title, description: item.summary, type: "article" as const, href: `/articles/${item.slug}` })),
    ...answers.map((item) => ({ id: `answer:${item.slug}`, label: item.question, description: item.shortAnswer, type: "answer" as const, href: `/answers/${item.slug}` })),
    ...topics.map((item) => ({ id: `topic:${item.slug}`, label: item.title, description: item.claim, type: "topic" as const, href: `/topics/${item.slug}` })),
    ...pathways.map((item) => ({ id: `pathway:${item.slug}`, label: item.title, description: item.summary, type: "pathway" as const, href: `/pathways/${item.slug}` })),
    ...scriptures.map((item) => ({ id: `scripture:${item.slug}`, label: item.reference, description: item.mainPoint, type: "scripture" as const, href: `/scripture/${item.path}` }))
  ];
  for (const item of siteItems) {
    if (results.length >= 16) break;
    if (includesQuery([item.label, item.description, item.type], query)) push(item);
  }

  if (hasStudioPermission(access.role, "view_journeys") && results.length < 16) {
    const service = createServiceClient();
    if (service) {
      const { data } = await service.from("growth_journeys").select("id,name,status").limit(100);
      for (const journey of data ?? []) {
        if (results.length >= 16) break;
        if (!includesQuery([journey.name, journey.status], query)) continue;
        push({ id: `journey:${journey.id}`, label: journey.name, description: `${journey.status} journey`, type: "journey", href: `/admin/journeys/${journey.id}` });
      }
    }
  }

  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
