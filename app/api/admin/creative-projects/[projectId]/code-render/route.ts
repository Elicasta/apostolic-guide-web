import { put, del } from "@vercel/blob";
import { privateBlobReadUrl } from "@/private-blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { zipSync } from "fflate";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { loadCreativeProject } from "@/creative-project-server";
import { codeTheme } from "@/carousel-code";
import { renderCodeFrames } from "@/carousel-code-render";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success)
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  try {
    const project = await loadCreativeProject(service, projectId);
    if (!project)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (project.status !== "draft")
      return NextResponse.json(
        { error: "Code Mode exports draft projects only" },
        { status: 409 },
      );
    const theme = codeTheme(project.editorState);
    if (!theme?.enabled)
      return NextResponse.json(
        { error: "Apply Custom Theme first" },
        { status: 400 },
      );
    const parsed = z
      .object({
        expectedStateVersion: z.number().int(),
        frameIndex: z.number().int().min(0).max(19).optional(),
      })
      .parse(await request.json());
    if (parsed.expectedStateVersion !== project.stateVersion)
      return NextResponse.json(
        { error: "Draft changed. Reload before exporting." },
        { status: 409 },
      );
    if (
      parsed.frameIndex !== undefined &&
      parsed.frameIndex >= project.editorState.frames.length
    )
      return NextResponse.json({ error: "Frame not found" }, { status: 404 });
    const origin =
      process.env.NEXT_PUBLIC_WEBSITE_URL || "https://www.apostolicguide.com";
    const pngs = await renderCodeFrames(
      project.editorState.frames,
      theme,
      origin,
      parsed.frameIndex,
    );
    const name =
      project.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "carousel";
    if (
      parsed.frameIndex !== undefined &&
      pngs[0].png.length > 4 * 1024 * 1024
    ) {
      const filename = `slide-${String(parsed.frameIndex + 1).padStart(2, "0")}.png`;
      const blob = await put(
        `carousel-code-exports/${projectId}/${crypto.randomUUID()}-${filename}`,
        pngs[0].png,
        { access: "private", contentType: "image/png", addRandomSuffix: true },
      );
      return NextResponse.json({
        downloadUrl: await privateBlobReadUrl(blob.pathname),
        filename,
        cleanupPath: blob.pathname,
      });
    }
    if (parsed.frameIndex !== undefined)
      return new Response(new Uint8Array(pngs[0].png), {
        headers: {
          "content-type": "image/png",
          "content-disposition": `attachment; filename="slide-${String(parsed.frameIndex + 1).padStart(2, "0")}.png"`,
          "cache-control": "no-store",
        },
      });
    const zip = zipSync(
      Object.fromEntries(
        pngs.map((p) => [
          `slide-${String(p.index + 1).padStart(2, "0")}.png`,
          new Uint8Array(p.png),
        ]),
      ),
      { level: 0 },
    );
    const blob = await put(
      `carousel-code-exports/${projectId}/${crypto.randomUUID()}-${name}.zip`,
      Buffer.from(zip),
      {
        access: "private",
        contentType: "application/zip",
        addRandomSuffix: true,
      },
    );
    return NextResponse.json({
      downloadUrl: await privateBlobReadUrl(blob.pathname),
      filename: `${name}.zip`,
      cleanupPath: blob.pathname,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  const parsed = z
    .object({ path: z.string().max(500) })
    .safeParse(await request.json());
  if (
    !z.string().uuid().safeParse(projectId).success ||
    !parsed.success ||
    !parsed.data.path.startsWith(`carousel-code-exports/${projectId}/`) ||
    parsed.data.path.includes("..")
  )
    return NextResponse.json({ error: "Invalid export path" }, { status: 400 });
  await del(parsed.data.path);
  return NextResponse.json({ deleted: true });
}
