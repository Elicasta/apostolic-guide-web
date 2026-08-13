import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const schema = z.object({
  job_id: z.string().uuid(),
  token: z.string().min(32).max(256),
  status: z.enum(["rendering", "completed", "failed"]),
  error: z.string().max(2000).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  stage: z.string().min(1).max(80).optional()
});

type BridgeSnapshot = {
  callbackTokenHash?: string;
  storagePath?: string;
  publicUrl?: string;
};

type RenderProgressSnapshot = {
  percent?: number;
  stage?: string;
  heartbeatAt?: string;
};

type RenderSnapshot = {
  rendererBridge?: BridgeSnapshot;
  rendererProgress?: RenderProgressSnapshot;
  replaceExisting?: boolean;
  [key: string]: unknown;
};

type CompletedRender = {
  id: string;
  asset_id: string | null;
  storage_path: string | null;
};

function tokenMatches(raw: string, expected: string) {
  const actual = createHash("sha256").update(raw).digest();
  const wanted = Buffer.from(expected, "hex");
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function record(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function replacePreviousRenders(
  service: NonNullable<ReturnType<typeof createServiceClient>>,
  current: { id: string; pathway_slug: string; asset_id: string | null; format: string },
  now: string
) {
  const previousResult = await service.from("pathway_video_renders")
    .select("id,asset_id,storage_path")
    .eq("pathway_slug", current.pathway_slug)
    .eq("format", current.format)
    .eq("status", "completed")
    .neq("id", current.id)
    .order("requested_at", { ascending: false });
  if (previousResult.error) throw new Error(previousResult.error.message);

  const previous = (previousResult.data ?? []) as CompletedRender[];
  if (!previous.length) return;

  for (const old of previous) {
    if (!old.asset_id || !current.asset_id) continue;
    const activePublications = await service.from("pathway_publications")
      .select("id,metadata")
      .eq("asset_id", old.asset_id)
      .in("status", ["scheduled", "publishing"]);
    if (activePublications.error) throw new Error(activePublications.error.message);

    for (const publication of activePublications.data ?? []) {
      const metadata = record(publication.metadata);
      const nextMetadata = metadata.source_kind === "render" || metadata.render_id === old.id
        ? { ...metadata, source_kind: "render", render_id: current.id }
        : metadata;
      const publicationUpdate = await service.from("pathway_publications").update({
        asset_id: current.asset_id,
        metadata: nextMetadata,
        updated_at: now
      }).eq("id", publication.id);
      if (publicationUpdate.error) throw new Error(publicationUpdate.error.message);
    }
  }

  const storagePaths = previous.flatMap((old) => old.storage_path ? [old.storage_path] : []);
  if (storagePaths.length) {
    const removal = await service.storage.from("pathway-video").remove(storagePaths);
    if (removal.error) throw new Error(removal.error.message);
  }

  for (const old of previous) {
    let keepPublishedStatus = false;
    if (old.asset_id) {
      const published = await service.from("pathway_publications")
        .select("id")
        .eq("asset_id", old.asset_id)
        .eq("status", "published")
        .limit(1)
        .maybeSingle();
      if (published.error) throw new Error(published.error.message);
      keepPublishedStatus = Boolean(published.data);

      const assetUpdate = await service.from("pathway_assets").update({
        status: keepPublishedStatus ? "published" : "archived",
        file_url: null,
        notes: `Local MP4 replaced by regenerated ${current.format} render ${current.id}.`,
        updated_at: now
      }).eq("id", old.asset_id);
      if (assetUpdate.error) throw new Error(assetUpdate.error.message);
    }

    const renderUpdate = await service.from("pathway_video_renders").update({
      status: "failed",
      storage_path: null,
      output_url: null,
      error: `Replaced by regenerated render ${current.id}.`
    }).eq("id", old.id);
    if (renderUpdate.error) throw new Error(renderUpdate.error.message);
  }
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid renderer callback." }, { status: 400 });

  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Renderer callback is unavailable." }, { status: 503 });

  const renderResult = await service.from("pathway_video_renders")
    .select("id,pathway_slug,asset_id,format,status,started_at,config_snapshot")
    .eq("id", parsed.data.job_id)
    .maybeSingle();
  if (renderResult.error) return NextResponse.json({ error: renderResult.error.message }, { status: 500 });
  if (!renderResult.data) return NextResponse.json({ error: "Render job not found." }, { status: 404 });

  const snapshot = (renderResult.data.config_snapshot ?? {}) as RenderSnapshot;
  const bridge = snapshot.rendererBridge ?? {};
  if (!bridge.callbackTokenHash || !tokenMatches(parsed.data.token, bridge.callbackTokenHash)) {
    return NextResponse.json({ error: "Invalid renderer token." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const previousProgress = snapshot.rendererProgress ?? {};
  const nextProgress: RenderProgressSnapshot = {
    percent: parsed.data.progress ?? previousProgress.percent ?? (parsed.data.status === "completed" ? 100 : 1),
    stage: parsed.data.stage ?? previousProgress.stage ?? (parsed.data.status === "completed" ? "Ready" : "Rendering video"),
    heartbeatAt: now
  };
  const nextSnapshot: RenderSnapshot = { ...snapshot, rendererProgress: nextProgress };

  if (parsed.data.status === "rendering") {
    const values: Record<string, unknown> = {
      status: "rendering",
      error: null,
      config_snapshot: nextSnapshot
    };
    if (!renderResult.data.started_at) values.started_at = now;
    const update = await service.from("pathway_video_renders").update(values).eq("id", renderResult.data.id);
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ ok: true, progress: nextProgress });
  }

  if (parsed.data.status === "failed") {
    const error = parsed.data.error?.trim() || "Renderer failed without an error message.";
    const failedSnapshot: RenderSnapshot = {
      ...nextSnapshot,
      rendererProgress: { ...nextProgress, stage: parsed.data.stage ?? "Failed", heartbeatAt: now }
    };
    const updates = [
      service.from("pathway_video_renders").update({
        status: "failed",
        error,
        completed_at: now,
        config_snapshot: failedSnapshot
      }).eq("id", renderResult.data.id)
    ];
    if (renderResult.data.asset_id) {
      updates.push(service.from("pathway_assets").update({
        status: "blocked",
        notes: `Video Studio render failed: ${error.slice(0, 1500)}`,
        updated_at: now
      }).eq("id", renderResult.data.asset_id));
    }
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!bridge.storagePath || !bridge.publicUrl) {
    return NextResponse.json({ error: "Render bridge output metadata is missing." }, { status: 409 });
  }

  const completedSnapshot: RenderSnapshot = {
    ...nextSnapshot,
    rendererProgress: { percent: 100, stage: parsed.data.stage ?? "Ready", heartbeatAt: now }
  };
  const updates = [
    service.from("pathway_video_renders").update({
      status: "completed",
      storage_path: bridge.storagePath,
      output_url: bridge.publicUrl,
      completed_at: now,
      error: null,
      config_snapshot: completedSnapshot
    }).eq("id", renderResult.data.id)
  ];
  if (renderResult.data.asset_id) {
    updates.push(service.from("pathway_assets").update({
      status: "ready_to_publish",
      file_url: bridge.publicUrl,
      updated_at: now
    }).eq("id", renderResult.data.asset_id));
  }
  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });

  if (snapshot.replaceExisting) {
    try {
      await replacePreviousRenders(service, {
        id: renderResult.data.id,
        pathway_slug: renderResult.data.pathway_slug,
        asset_id: renderResult.data.asset_id,
        format: renderResult.data.format
      }, now);
    } catch (cleanupError) {
      console.error("regenerated render cleanup failed", cleanupError);
    }
  }

  return NextResponse.json({ ok: true, output_url: bridge.publicUrl });
}
