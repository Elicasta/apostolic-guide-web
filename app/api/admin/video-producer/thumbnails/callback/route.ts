import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { workerTokenMatches } from "@/video-producer-server";

export const runtime = "nodejs";

const schema = z.object({
  projectId: z.string().uuid(),
  token: z.string().min(1),
  status: z.enum(["completed", "failed"]),
  error: z.string().optional()
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid callback." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Service unavailable." }, { status: 503 });

  const rows = await service.from("video_producer_thumbnails")
    .select("id,callback_token_hash,status")
    .eq("project_id", parsed.data.projectId);
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });
  const active = (rows.data ?? []).filter((row) => row.callback_token_hash && row.status !== "completed");
  if (!active.length || !active.every((row) => workerTokenMatches(parsed.data.token, row.callback_token_hash!))) {
    return NextResponse.json({ error: "Invalid or expired callback token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const update = await service.from("video_producer_thumbnails").update({
    status: parsed.data.status,
    error: parsed.data.status === "failed" ? parsed.data.error || "Thumbnail worker failed." : null,
    completed_at: parsed.data.status === "completed" ? now : null,
    callback_token_hash: null
  }).eq("project_id", parsed.data.projectId).neq("status", "completed");
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
