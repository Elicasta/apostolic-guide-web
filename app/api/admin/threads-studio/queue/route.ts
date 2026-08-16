import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

const requestSchema = z.object({
  batchId: z.string().uuid().optional(),
  items: z.array(z.object({
    id: z.string().uuid().optional(),
    body: z.string().min(1).max(1000),
    category: z.enum(["oneness","scripture","witty","question","prayer-news","app","response"]),
    scheduledFor: z.string().datetime(),
    doctrineStatus: z.enum(["pass","warning","blocked"]).optional(),
    sourceTitle: z.string().max(300).optional(),
    sourceUrl: z.string().url().max(1500).optional(),
    sourceSummary: z.string().max(1000).optional(),
    mirrorToX: z.boolean().optional().default(false)
  })).min(1).max(30),
  allowWarnings: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads queue request." }, { status: 400 });
  if (parsed.data.items.some((item) => item.doctrineStatus === "blocked")) return NextResponse.json({ error: "Blocked posts cannot be queued." }, { status: 409 });
  if (!parsed.data.allowWarnings && parsed.data.items.some((item) => item.doctrineStatus === "warning")) return NextResponse.json({ error: "Resolve or approve warning posts before queueing." }, { status: 409 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  let batchId = parsed.data.batchId;
  if (!batchId) {
    const first = new Date(parsed.data.items[0].scheduledFor);
    const weekStart = new Date(first); weekStart.setDate(first.getDate() - first.getDay());
    const created = await service.from("studio_threads_batches").insert({ week_start: weekStart.toISOString().slice(0,10), topic: "Threads queue", voice: "serious-witty", status: "approved" }).select("id").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    batchId = created.data.id;
  }

  const saved = [] as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  for (let index = 0; index < parsed.data.items.length; index += 1) {
    const item = parsed.data.items[index];
    let row;
    if (item.id) {
      const result = await service.from("studio_threads_posts").update({ body: item.body, category: item.category, doctrine_status: item.doctrineStatus ?? null, status: "scheduled", scheduled_for: item.scheduledFor, x_status: item.mirrorToX ? "mirror-later" : "off", source_title: item.sourceTitle ?? null, source_url: item.sourceUrl ?? null, source_summary: item.sourceSummary ?? null, updated_at: now }).eq("id", item.id).select("*").single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data;
    } else {
      const result = await service.from("studio_threads_posts").insert({ batch_id: batchId, position: index + 1, category: item.category, body: item.body, doctrine_status: item.doctrineStatus ?? null, status: "scheduled", scheduled_for: item.scheduledFor, x_status: item.mirrorToX ? "mirror-later" : "off", source_title: item.sourceTitle ?? null, source_url: item.sourceUrl ?? null, source_summary: item.sourceSummary ?? null }).select("*").single();
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      row = result.data;
    }
    saved.push(row as Record<string, unknown>);

    const rowId = String(row.id);
    const calendarValues = {
      title: item.body.slice(0,80),
      content_type: "thread",
      platform: "threads",
      status: "scheduled",
      scheduled_for: item.scheduledFor,
      published_at: null,
      source: "threads-studio",
      source_ref: rowId,
      metadata: { threads_post_id: rowId, category: item.category, doctrine_status: item.doctrineStatus ?? null, mirror_to_x: item.mirrorToX, source_url: item.sourceUrl ?? null },
      updated_at: now
    };
    const existingCalendar = await service.from("studio_content_calendar_items").select("id").eq("source", "threads-studio").eq("source_ref", rowId).limit(1);
    if (existingCalendar.error) return NextResponse.json({ error: existingCalendar.error.message }, { status: 500 });
    const calendar = existingCalendar.data?.length
      ? await service.from("studio_content_calendar_items").update(calendarValues).eq("source", "threads-studio").eq("source_ref", rowId)
      : await service.from("studio_content_calendar_items").insert(calendarValues);
    if (calendar.error) return NextResponse.json({ error: calendar.error.message }, { status: 500 });
  }
  await service.from("studio_threads_batches").update({ status: "scheduled", updated_at: now }).eq("id", batchId);
  return NextResponse.json({ ok: true, batchId, posts: saved });
}
