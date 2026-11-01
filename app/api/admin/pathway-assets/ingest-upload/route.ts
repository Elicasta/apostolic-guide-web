import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { PATHWAY_ASSET_MAX_UPLOAD_BYTES, PATHWAY_ASSET_STORAGE_PROVIDER } from "@/pathway-asset-ingest";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

type ClientPayload = { sessionId: string };

type TokenPayload = {
  sessionId: string;
  userId: string;
  pathname: string;
  mimeType: string;
  fileSize: number;
};

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return NextResponse.json({ error: "Vercel Blob is not connected." }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { access, allowed } = await getStudioPermission("manage_content");
        if (!allowed || access.state !== "allowed" || !access.user) throw new Error("Forbidden");

        let payload: ClientPayload;
        try { payload = JSON.parse(clientPayload || "{}") as ClientPayload; }
        catch { throw new Error("Invalid upload payload."); }
        if (!payload.sessionId) throw new Error("Upload session is required.");

        const service = createServiceClient();
        if (!service) throw new Error("Supabase is not configured.");
        const session = await service.from("studio_pathway_asset_uploads")
          .select("id,user_id,storage_bucket,storage_path,mime_type,file_size,status")
          .eq("id", payload.sessionId)
          .eq("user_id", access.user.id)
          .maybeSingle();
        if (session.error) throw new Error(session.error.message);
        if (!session.data) throw new Error("Upload session was not found.");
        if (session.data.storage_bucket !== PATHWAY_ASSET_STORAGE_PROVIDER) throw new Error("Upload session is not configured for Vercel Blob.");
        if (session.data.storage_path !== pathname) throw new Error("Upload path does not match the prepared session.");
        if (!["prepared", "failed"].includes(session.data.status)) throw new Error("This upload session cannot start again.");
        if (Number(session.data.file_size) <= 0 || Number(session.data.file_size) > PATHWAY_ASSET_MAX_UPLOAD_BYTES) throw new Error("Source file exceeds the Pathway ingest limit.");

        const update = await service.from("studio_pathway_asset_uploads").update({
          status: "uploading",
          bytes_uploaded: 0,
          error_message: null,
          updated_at: new Date().toISOString()
        }).eq("id", session.data.id);
        if (update.error) throw new Error(update.error.message);

        return {
          allowedContentTypes: [session.data.mime_type],
          maximumSizeInBytes: Number(session.data.file_size),
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            sessionId: session.data.id,
            userId: access.user.id,
            pathname: session.data.storage_path,
            mimeType: session.data.mime_type,
            fileSize: Number(session.data.file_size)
          } satisfies TokenPayload)
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        let payload: TokenPayload;
        try { payload = JSON.parse(tokenPayload || "{}") as TokenPayload; }
        catch { throw new Error("Invalid upload completion payload."); }
        if (blob.pathname !== payload.pathname) throw new Error("Completed blob path does not match the prepared session.");

        const service = createServiceClient();
        if (!service) throw new Error("Supabase is not configured.");
        const update = await service.from("studio_pathway_asset_uploads").update({
          status: "uploaded",
          bytes_uploaded: payload.fileSize,
          error_message: null,
          updated_at: new Date().toISOString()
        }).eq("id", payload.sessionId).eq("user_id", payload.userId);
        if (update.error) throw new Error(update.error.message);
      }
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vercel Blob upload could not be authorized.";
    return NextResponse.json({ error: message }, { status: message === "Forbidden" ? 403 : 400 });
  }
}
