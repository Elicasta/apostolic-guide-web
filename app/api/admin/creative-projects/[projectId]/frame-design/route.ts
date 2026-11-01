import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CAROUSEL_TEXTURES } from "@/carousel-design-rules";
import { loadCreativeProject } from "@/creative-project-server";
import { createServiceClient } from "@/supabase";

const textureIds = CAROUSEL_TEXTURES.map((texture) => texture.id) as [string, ...string[]];
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

const designSchema = z.object({
  copyY: z.number().min(32).max(68),
  headlineScale: z.number().min(0.55).max(1.45),
  titleWidth: z.number().min(48).max(98),
  bodyScale: z.number().min(0.65).max(1.35),
  bodyWidth: z.number().min(45).max(94),
  copyGap: z.number().min(0.5).max(5),
  alignment: z.enum(["left", "center", "right"]),
  textColor: color.optional().default(null),
  headlineFont: z.enum(["Montserrat", "Bebas Neue", "Cormorant Garamond"]).optional(),
  bodyFont: z.enum(["Montserrat", "Bebas Neue", "Cormorant Garamond"]).optional(),
  headlineColor: color.optional(),
  bodyColor: color.optional(),
  texture: z.enum(textureIds),
  textureStrength: z.number().min(0).max(70)
});

const saveSchema = z.object({
  frameId: z.string().trim().min(1).max(100),
  design: designSchema
});

const deleteSchema = z.object({ frameId: z.string().trim().min(1).max(100) });

async function getContext(projectId: string) {
  if (!z.string().uuid().safeParse(projectId).success) return { error: NextResponse.json({ error: "Invalid project ID." }, { status: 400 }) };
  const service = createServiceClient();
  if (!service) return { error: NextResponse.json({ error: "Supabase is not configured." }, { status: 503 }) };
  const project = await loadCreativeProject(service, projectId);
  if (!project) return { error: NextResponse.json({ error: "Creative Project not found." }, { status: 404 }) };
  return { service, project };
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  const resolved = await getContext(projectId);
  if ("error" in resolved) return resolved.error;

  const result = await resolved.service.from("studio_creative_frame_designs")
    .select("frame_id,design,updated_at")
    .eq("project_id", projectId);
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const validFrameIds = new Set(resolved.project.editorState.frames.map((frame) => frame.id));
  return NextResponse.json({
    frames: resolved.project.editorState.frames.map((frame) => ({ id: frame.id, order: frame.order })),
    designs: (result.data ?? []).filter((row) => validFrameIds.has(String(row.frame_id))).map((row) => ({
      frameId: String(row.frame_id),
      design: row.design,
      updatedAt: row.updated_at
    }))
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid slide design." }, { status: 400 });
  const resolved = await getContext(projectId);
  if ("error" in resolved) return resolved.error;
  if (!resolved.project.editorState.frames.some((frame) => frame.id === parsed.data.frameId)) {
    return NextResponse.json({ error: "Frame not found in this project." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const result = await resolved.service.from("studio_creative_frame_designs").upsert({
    project_id: projectId,
    frame_id: parsed.data.frameId,
    design: parsed.data.design,
    updated_by: access.user.id,
    updated_at: now
  }, { onConflict: "project_id,frame_id" }).select("frame_id,design,updated_at").single();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  return NextResponse.json({ frameId: result.data.frame_id, design: result.data.design, updatedAt: result.data.updated_at });
}

export async function DELETE(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { projectId } = await context.params;
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid frame." }, { status: 400 });
  const resolved = await getContext(projectId);
  if ("error" in resolved) return resolved.error;

  const removed = await resolved.service.from("studio_creative_frame_designs")
    .delete()
    .eq("project_id", projectId)
    .eq("frame_id", parsed.data.frameId);
  if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
