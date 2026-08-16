import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const categorySchema = z.enum(["oneness","scripture","witty","question","prayer-news","app","response"]);
const doctrineSchema = z.enum(["pass","warning","blocked"]);

const readySchema = z.object({
  batchId: z.string().uuid().optional(),
  items: z.array(z.object({
    id: z.string().uuid().optional(),
    body: z.string().trim().min(1).max(1000),
    category: categorySchema,
    doctrineStatus: doctrineSchema.optional(),
    sourceTitle: z.string().max(300).optional(),
    sourceUrl: z.string().url().max(1500).optional(),
    sourceSummary: z.string().max(1000).optional(),
    mirrorToX: z.boolean().optional().default(false)
  })).min(1).max(30),
  allowWarnings: z.boolean().optional().default(false)
});

export async function GET() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ posts: [], configured: false });

  const result = await service
    .from("studio_threads_posts")
    .select("*")
    .in("status", ["ready", "scheduled", "published", "failed"])
    .order("updated_at", { ascending: false })
    .limit(200);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ posts: result.data ?? [], configured: true });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = readySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads ready request." }, { status: 400 });
  if (parsed.data.items.some((item) => item.doctrineStatus === "blocked")) return NextResponse.json({ error: "Blocked posts cannot leave Threads Studio." }, { status: 409 });
  if (!parsed.data.allowWarnings && parsed.data.items.some((item) => item.doctrineStatus === "warning")) return NextResponse.json({ error: "Resolve or approve warning posts first." }, { status: 409 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  let batchId = parsed.data.batchId;
  if (!batchId) {
    const created = await service.from("studio_threads_batches").insert({
      week_start: new Date().toISOString().slice(0, 10),
      topic: "Threads ready queue",
      voice: "serious-witty",
      status: "approved"
    }).select("id").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    batchId = created.data.id;
  }

  const now = new Date().toISOString();
  const saved: Array<Record<string, unknown>> = [];
  for (let index = 0; index < parsed.data.items.length; index += 1) {
    const item = parsed.data.items[index];
    let row: Record<string, unknown>;
    const values = {
      body: item.body,
      category: item.category,
      doctrine_status: item.doctrineStatus ?? null,
      status: "ready",
      scheduled_for: null,
      x_status: item.mirrorToX ? "mirror-later" : "off",
      source_title: item.sourceTitle ?? null,
      source_url: item.sourceUrl ?? null,
      source_summary: item.sourceSummary ?? null,
      updated_at: now
    };

    if (item.id) {
      const result = await service.from("studio_threads_posts").update(values).eq("id", item.id).select("*").single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data as Record<string, unknown>;
    } else {
      const result = await service.from("studio_threads_posts").insert({
        batch_id: batchId,
        position: index + 1,
        ...values
      }).select("*").single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data as Record<string, unknown>;
    }

    saved.push(row);
    const rowId = String(row.id);
    const calendar = await service.from("studio_content_calendar_items").upsert({
      title: item.body.slice(0, 80),
      content_type: "thread",
      platform: "threads",
      status: "ready",
      scheduled_for: null,
      published_at: null,
      source: "threads-studio",
      source_ref: rowId,
      metadata: {
        threads_post_id: rowId,
        category: item.category,
        doctrine_status: item.doctrineStatus ?? null,
        mirror_to_x: item.mirrorToX,
        source_title: item.sourceTitle ?? null,
        source_url: item.sourceUrl ?? null
      },
      updated_at: now
    }, { onConflict: "source,source_ref" });
    if (calendar.error) return NextResponse.json({ error: calendar.error.message }, { status: 500 });
  }

  await service.from("studio_threads_batches").update({ status: "approved", updated_at: now }).eq("id", batchId);
  return NextResponse.json({ ok: true, batchId, posts: saved });
}
