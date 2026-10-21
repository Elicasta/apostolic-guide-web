import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { loadCreativeProject } from "@/creative-project-server";
import { renderForgeFramePng } from "@/forge-carousel-image";
import { createServiceClient } from "@/supabase";
import { buildBroadcastEmail, type BroadcastCampaign } from "@/broadcast-email";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const id = url.searchParams.get("project") || "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  try {
    // Restrict this preview to projects owned by the editorial production ledger.
    const pack = await service.from("studio_editorial_packs").select("payload").eq("project_id", id).maybeSingle();
    if (pack.error) throw new Error(pack.error.message);
    if (!pack.data) return NextResponse.json({ error: "Editorial project not found." }, { status: 404 });
    if (url.searchParams.get("kind") === "newsletter") {
      const campaign = (pack.data.payload as { newsletter?: BroadcastCampaign }).newsletter;
      if (!campaign) return NextResponse.json({ error: "No newsletter for this day." }, { status: 404 });
      return new Response(buildBroadcastEmail(campaign).html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; frame-ancestors 'self'", "content-disposition": url.searchParams.get("download") === "1" ? 'attachment; filename="weekly-study.html"' : "inline" } });
    }
    const index = Number(url.searchParams.get("frame") || "0");
    if (!Number.isInteger(index) || index < 0 || index >= 20) return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
    const project = await loadCreativeProject(service, id);
    const frame = project?.editorState.frames[index];
    if (!project || !frame) return NextResponse.json({ error: "Frame not found." }, { status: 404 });
    const png = await renderForgeFramePng({ frame, index, total: project.editorState.frames.length, pathwayTitle: project.pathwayTitle, projectTitle: project.title, theme: project.editorState.visualSettings.style || project.editorState.visualSettings.template, regenerationSeed: Number(project.editorState.visualSettings.regenerationSeed || 0) });
    return new Response(new Uint8Array(png), { headers: { "content-type": "image/png", "cache-control": "private, no-store", "content-disposition": url.searchParams.get("download") === "1" ? `attachment; filename="${project.pathwaySlug}-${index + 1}.png"` : "inline" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Preview failed." }, { status: 503 }); }
}
