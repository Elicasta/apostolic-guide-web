import { NextResponse } from "next/server";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ artifactId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.role || !hasStudioPermission(access.role, "view_workspace")) return new NextResponse("Forbidden", { status: 403 });
  const service = createServiceClient();
  if (!service) return new NextResponse("Database unavailable", { status: 503 });
  const { artifactId } = await context.params;
  const result = await service.from("studio_campaign_artifacts").select("id,mime_type,content_text,title").eq("id", artifactId).maybeSingle();
  if (result.error) return new NextResponse(result.error.message, { status: 500 });
  if (!result.data) return new NextResponse("Not found", { status: 404 });
  if (!result.data.content_text) return NextResponse.json({ error: "Artifact has no renderable text content." }, { status: 404 });
  const mime = String(result.data.mime_type || "text/plain");
  const allowed = mime === "image/svg+xml" || mime === "text/plain" || mime === "application/json";
  if (!allowed) return new NextResponse("Unsupported artifact type", { status: 415 });
  return new NextResponse(String(result.data.content_text), {
    status: 200,
    headers: {
      "content-type": mime === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : `${mime}; charset=utf-8`,
      "cache-control": "private, max-age=0, no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
    }
  });
}
