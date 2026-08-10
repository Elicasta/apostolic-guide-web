import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { recordStudioAudit } from "@/studio-audit";

const schema = z.object({
  kind: z.enum(["article", "answer", "topic"]),
  title: z.string().min(3).max(180),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
  summary: z.string().min(10).max(500),
  body: z.string().min(10).max(100_000),
  publishWebsite: z.boolean()
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
    p_actor_user_id: access.user.id
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await recordStudioAudit({ actorUserId: access.user.id, action: parsed.data.publishWebsite ? "content.created_and_published" : "content.created", resourceType: "content", metadata: { kind: parsed.data.kind, title: parsed.data.title, slug: parsed.data.slug, channel: parsed.data.publishWebsite ? "website" : "draft" } });
  return NextResponse.json({ item: data });
}
