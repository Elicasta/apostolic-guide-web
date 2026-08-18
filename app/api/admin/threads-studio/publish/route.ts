import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { publishThreadsText } from "@/threads-publisher";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  id: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(500),
  category: z.enum(["oneness","scripture","witty","question","prayer-news","app","response"]),
  doctrineStatus: z.enum(["pass","warning","blocked"])
});

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads publish request." }, { status: 400 });
  if (parsed.data.doctrineStatus === "blocked") return NextResponse.json({ error: "Blocked posts cannot be published." }, { status: 409 });
  try {
    const published = await publishThreadsText(parsed.data.body);
    const service = createServiceClient();
    let recordId: string | null = parsed.data.id ?? null;
    const now = new Date().toISOString();

    if (service) {
      if (parsed.data.id) {
        const saved = await service.from("studio_threads_posts").update({
          body: parsed.data.body,
          category: parsed.data.category,
          doctrine_status: parsed.data.doctrineStatus,
          status: "published",
          scheduled_for: null,
          published_at: now,
          threads_post_id: published.id,
          threads_permalink: published.permalink,
          updated_at: now
        }).eq("id", parsed.data.id).select("id").single();
        if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
      } else {
        const batch = await service.from("studio_threads_batches").insert({ week_start: now.slice(0,10), topic: "Single Threads post", voice: "serious-witty", status: "published" }).select("id").single();
        if (!batch.error && batch.data) {
          const saved = await service.from("studio_threads_posts").insert({
            batch_id: batch.data.id,
            position: 1,
            category: parsed.data.category,
            body: parsed.data.body,
            doctrine_status: parsed.data.doctrineStatus,
            status: "published",
            published_at: now,
            threads_post_id: published.id,
            threads_permalink: published.permalink,
            x_status: "off"
          }).select("id").single();
          if (!saved.error && saved.data) recordId = saved.data.id;
        }
      }

      if (recordId) {
        const calendarValues = {
          title: parsed.data.body.slice(0,80),
          content_type: "thread",
          platform: "threads",
          status: "published",
          scheduled_for: null,
          published_at: now,
          source: "threads-studio",
          source_ref: recordId,
          metadata: { threads_post_id: recordId, category: parsed.data.category, doctrine_status: parsed.data.doctrineStatus, external_post_id: published.id, permalink: published.permalink },
          updated_at: now
        };
        const existingCalendar = await service.from("studio_content_calendar_items").select("id").eq("source", "threads-studio").eq("source_ref", recordId).limit(1);
        if (!existingCalendar.error) {
          const calendar = existingCalendar.data?.length
            ? await service.from("studio_content_calendar_items").update(calendarValues).eq("source", "threads-studio").eq("source_ref", recordId)
            : await service.from("studio_content_calendar_items").insert(calendarValues);
          if (calendar.error) console.error("Threads calendar sync failed after publish", calendar.error.message);
        } else {
          console.error("Threads calendar lookup failed after publish", existingCalendar.error.message);
        }
      }
    }
    return NextResponse.json({ ok: true, id: published.id, permalink: published.permalink, recordId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Threads publishing failed." }, { status: 502 });
  }
}
