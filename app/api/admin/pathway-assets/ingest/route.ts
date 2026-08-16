import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";
import {
  isSupportedPathwayAssetMime,
  PATHWAY_ASSET_INGEST_BUCKET,
  PATHWAY_ASSET_MAX_UPLOAD_BYTES,
  pathwayAssetIngestStudio,
  pathwayAssetIngestType,
  pathwayAssetMediaKind,
  sanitizePathwayAssetFilename,
  type PathwayAssetIngestStudio
} from "@/pathway-asset-ingest";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const studioSchema = z.enum(["carousel", "video"]);
const prepareSchema = z.object({
  action: z.literal("prepare"),
  pathwaySlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  studio: studioSchema,
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  fileSize: z.number().int().positive().max(PATHWAY_ASSET_MAX_UPLOAD_BYTES),
  lastModified: z.number().int().nonnegative().optional(),
  clientFingerprint: z.string().trim().min(1).max(700).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  mediaMetadata: z.record(z.string(), z.unknown()).optional().default({})
});
const renewSchema = z.object({ action: z.literal("renew"), sessionId: z.string().uuid() });
const attachSchema = z.object({ action: z.literal("attach"), sessionId: z.string().uuid(), tusUrl: z.string().url().max(1200) });
const progressSchema = z.object({
  action: z.enum(["progress", "pause", "fail"]),
  sessionId: z.string().uuid(),
  bytesUploaded: z.number().int().nonnegative().optional(),
  error: z.string().trim().max(800).optional()
});
const finalizeSchema = z.object({ action: z.literal("finalize"), sessionId: z.string().uuid() });
const cancelSchema = z.object({ action: z.literal("cancel"), sessionId: z.string().uuid() });
const actionSchema = z.discriminatedUnion("action", [prepareSchema, renewSchema, attachSchema, progressSchema, finalizeSchema, cancelSchema]);

type Service = NonNullable<ReturnType<typeof createServiceClient>>;

function directTusEndpoint() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.endsWith(".supabase.co")
      ? url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co")
      : url.hostname;
    return `${url.protocol}//${host}/storage/v1/upload/resumable`;
  } catch {
    return null;
  }
}

async function signPath(service: Service, path: string) {
  const signed = await service.storage.from(PATHWAY_ASSET_INGEST_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.token) throw new Error(signed.error?.message || "Could not authorize upload.");
  const endpoint = directTusEndpoint();
  if (!endpoint) throw new Error("Supabase upload endpoint is not configured.");
  return { signature: signed.data.token, endpoint };
}

async function audit(service: Service, userId: string, action: string, resourceId: string, metadata: Record<string, unknown>) {
  const result = await service.rpc("record_studio_audit", {
    p_actor_user_id: userId,
    p_action: action,
    p_resource_type: "pathway_asset_upload",
    p_resource_id: resourceId,
    p_metadata: metadata
  });
  if (result.error) console.error("pathway ingest audit failed", result.error.message);
}

async function ownedSession(service: Service, userId: string, sessionId: string) {
  return service.from("studio_pathway_asset_uploads").select("*").eq("id", sessionId).eq("user_id", userId).maybeSingle();
}

function titleFromFilename(fileName: string) {
  const value = fileName.replace(/\.[a-zA-Z0-9]{1,10}$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return value.slice(0, 180) || "Pathway media source";
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const pathwaySlug = new URL(request.url).searchParams.get("pathwaySlug")?.trim();
  let query = service.from("studio_pathway_asset_uploads")
    .select("id,pathway_slug,studio,asset_type,file_name,mime_type,file_size,status,bytes_uploaded,error_message,expires_at,asset_id,created_at,updated_at")
    .eq("user_id", access.user.id)
    .in("status", ["prepared", "uploading", "paused", "uploaded", "failed"])
    .order("updated_at", { ascending: false })
    .limit(30);
  if (pathwaySlug) query = query.eq("pathway_slug", pathwaySlug);
  const result = await query;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ sessions: result.data ?? [] });
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid ingest request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const userId = access.user.id;

  if (parsed.data.action === "prepare") {
    const input = parsed.data;
    const pathway = pathwayBySlug(input.pathwaySlug);
    if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });
    if (!isSupportedPathwayAssetMime(input.mimeType)) return NextResponse.json({ error: "That file type is not supported by Pathway Assets." }, { status: 415 });
    const assetType = pathwayAssetIngestType(input.mimeType);
    const mediaKind = pathwayAssetMediaKind(input.mimeType);
    if (!assetType || !mediaKind) return NextResponse.json({ error: "Unsupported media type." }, { status: 415 });
    const studio = pathwayAssetIngestStudio(input.mimeType, input.studio as PathwayAssetIngestStudio);

    if (input.clientFingerprint) {
      const resume = await service.from("studio_pathway_asset_uploads")
        .select("*")
        .eq("user_id", userId)
        .eq("client_fingerprint", input.clientFingerprint)
        .in("status", ["prepared", "uploading", "paused", "uploaded"])
        .gt("expires_at", new Date().toISOString())
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (resume.error) return NextResponse.json({ error: resume.error.message }, { status: 500 });
      if (resume.data) {
        try {
          const auth = await signPath(service, resume.data.storage_path);
          return NextResponse.json({ session: resume.data, ...auth, resumed: true });
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : "Could not resume upload." }, { status: 502 });
        }
      }
    }

    let duplicateAsset: Record<string, unknown> | null = null;
    if (input.sha256) {
      const duplicate = await service.from("studio_pathway_assets")
        .select("id,title,pathway_slug,studio,asset_type,status,updated_at")
        .contains("metadata", { sha256: input.sha256 })
        .neq("status", "archived")
        .limit(1)
        .maybeSingle();
      if (!duplicate.error && duplicate.data) duplicateAsset = duplicate.data as Record<string, unknown>;
    }

    const id = crypto.randomUUID();
    const now = new Date();
    const safeName = sanitizePathwayAssetFilename(input.fileName);
    const path = `${pathway.slug}/${studio}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}/${safeName}`;
    const session = await service.from("studio_pathway_asset_uploads").insert({
      id,
      user_id: userId,
      pathway_slug: pathway.slug,
      studio,
      asset_type: assetType,
      storage_bucket: PATHWAY_ASSET_INGEST_BUCKET,
      storage_path: path,
      file_name: input.fileName,
      mime_type: input.mimeType,
      file_size: input.fileSize,
      last_modified: input.lastModified ?? null,
      client_fingerprint: input.clientFingerprint ?? null,
      sha256: input.sha256 ?? null,
      media_metadata: input.mediaMetadata,
      status: "prepared",
      bytes_uploaded: 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).select("*").single();
    if (session.error) return NextResponse.json({ error: session.error.message }, { status: 500 });
    try {
      const auth = await signPath(service, path);
      await audit(service, userId, "pathway_asset.ingest_prepare", id, { pathwaySlug: pathway.slug, studio, assetType, mediaKind, fileSize: input.fileSize });
      return NextResponse.json({ session: session.data, ...auth, resumed: false, duplicateAsset });
    } catch (error) {
      await service.from("studio_pathway_asset_uploads").update({ status: "failed", error_message: "Upload authorization failed", updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not authorize upload." }, { status: 502 });
    }
  }

  const sessionResult = await ownedSession(service, userId, parsed.data.sessionId);
  if (sessionResult.error) return NextResponse.json({ error: sessionResult.error.message }, { status: 500 });
  const session = sessionResult.data;
  if (!session) return NextResponse.json({ error: "Upload session not found." }, { status: 404 });

  if (parsed.data.action === "renew") {
    if (["finalized", "cancelled", "expired"].includes(session.status)) return NextResponse.json({ error: "This upload session can no longer be resumed." }, { status: 409 });
    try {
      return NextResponse.json({ session, ...(await signPath(service, session.storage_path)) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not renew upload." }, { status: 502 });
    }
  }

  if (parsed.data.action === "attach") {
    const endpoint = directTusEndpoint();
    if (!endpoint || !parsed.data.tusUrl.startsWith(endpoint.replace(/\/resumable$/, ""))) return NextResponse.json({ error: "Invalid resumable upload URL." }, { status: 400 });
    const saved = await service.from("studio_pathway_asset_uploads").update({
      tus_url: parsed.data.tusUrl,
      status: "uploading",
      error_message: null,
      updated_at: new Date().toISOString()
    }).eq("id", session.id).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ session: saved.data });
  }

  if (parsed.data.action === "progress" || parsed.data.action === "pause" || parsed.data.action === "fail") {
    const bytesUploaded = Math.min(Math.max(parsed.data.bytesUploaded ?? Number(session.bytes_uploaded || 0), 0), Number(session.file_size));
    const status = parsed.data.action === "pause" ? "paused" : parsed.data.action === "fail" ? "failed" : "uploading";
    const saved = await service.from("studio_pathway_asset_uploads").update({
      bytes_uploaded: bytesUploaded,
      status,
      error_message: parsed.data.action === "fail" ? (parsed.data.error || "Upload failed") : null,
      updated_at: new Date().toISOString()
    }).eq("id", session.id).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    return NextResponse.json({ session: saved.data });
  }

  if (parsed.data.action === "cancel") {
    await service.storage.from(session.storage_bucket).remove([session.storage_path]);
    const saved = await service.from("studio_pathway_asset_uploads").update({
      status: "cancelled",
      error_message: null,
      updated_at: new Date().toISOString()
    }).eq("id", session.id).select("id,status").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    await audit(service, userId, "pathway_asset.ingest_cancel", session.id, { pathwaySlug: session.pathway_slug, fileName: session.file_name });
    return NextResponse.json({ session: saved.data });
  }

  if (parsed.data.action === "finalize") {
    if (session.asset_id) return NextResponse.json({ assetId: session.asset_id, alreadyFinalized: true });
    const slash = session.storage_path.lastIndexOf("/");
    const folder = session.storage_path.slice(0, slash);
    const name = session.storage_path.slice(slash + 1);
    const listed = await service.storage.from(session.storage_bucket).list(folder, { limit: 20, search: name });
    if (listed.error) return NextResponse.json({ error: listed.error.message }, { status: 502 });
    const object = (listed.data ?? []).find((item) => item.name === name);
    if (!object) return NextResponse.json({ error: "Upload has not finished reaching storage yet. Retry finalization in a moment." }, { status: 409 });
    const storedSize = Number((object.metadata as Record<string, unknown> | null)?.size || session.file_size);
    if (Number.isFinite(storedSize) && storedSize !== Number(session.file_size)) return NextResponse.json({ error: "Stored file size does not match the source file." }, { status: 409 });

    const mediaKind = pathwayAssetMediaKind(session.mime_type);
    const mediaMetadata = session.media_metadata && typeof session.media_metadata === "object" && !Array.isArray(session.media_metadata)
      ? session.media_metadata as Record<string, unknown>
      : {};
    const now = new Date().toISOString();
    const created = await service.from("studio_pathway_assets").insert({
      pathway_slug: session.pathway_slug,
      studio: session.studio,
      asset_type: session.asset_type,
      title: titleFromFilename(session.file_name),
      status: "draft",
      source_type: "uploaded",
      editable: mediaKind === "image",
      version: 1,
      content: {
        kind: mediaKind,
        role: "source-master",
        ingestSessionId: session.id
      },
      storage_bucket: session.storage_bucket,
      storage_path: session.storage_path,
      public_url: null,
      metadata: {
        originalFileName: session.file_name,
        mime: session.mime_type,
        mimeType: session.mime_type,
        bytes: Number(session.file_size),
        sha256: session.sha256 || undefined,
        mediaKind,
        role: "source-master",
        uploadMethod: "tus-resumable",
        ingestSessionId: session.id,
        lastModified: session.last_modified,
        ...mediaMetadata
      },
      created_by: userId,
      updated_by: userId,
      created_at: now,
      updated_at: now
    }).select("id,title,pathway_slug,studio,asset_type,status,metadata,updated_at").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });

    const finalized = await service.from("studio_pathway_asset_uploads").update({
      status: "finalized",
      bytes_uploaded: session.file_size,
      asset_id: created.data.id,
      error_message: null,
      updated_at: now
    }).eq("id", session.id);
    if (finalized.error) console.error("ingest ledger finalize failed", finalized.error.message);
    await audit(service, userId, "pathway_asset.ingest_finalize", session.id, { assetId: created.data.id, pathwaySlug: session.pathway_slug, studio: session.studio, assetType: session.asset_type, fileSize: session.file_size });
    return NextResponse.json({ asset: created.data, assetId: created.data.id });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
