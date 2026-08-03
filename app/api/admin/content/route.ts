import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";

const schema = z.object({
  kind: z.enum(["article", "answer", "topic"]),
  title: z.string().min(3).max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  summary: z.string().min(10).max(500),
  body: z.string().min(10).max(100_000),
  publishWebsite: z.boolean()
});

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid content" }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const { data, error } = await service.schema("content").rpc("create_editorial_item", {
    p_kind: parsed.data.kind,
    p_slug: parsed.data.slug,
    p_title: parsed.data.title,
    p_summary: parsed.data.summary,
    p_body: parsed.data.body,
    p_publish_website: parsed.data.publishWebsite,
    p_actor_user_id: access.user!.id
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
