import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { createEpisode, listEpisodes, StudioPersistenceError } from "@/studio/repository";

const CreateEpisodeSchema = z.object({
  title: z.string().trim().min(1).max(160),
  type: z.enum(["solo", "interview", "panel", "live_qa"]).default("solo"),
  accessMode: z.enum(["public", "account", "members", "private"]).default("public"),
  pathwayId: z.string().trim().min(1).optional()
});

async function requireProducer() {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user?.id || !["owner", "admin", "editor"].includes(access.role ?? "")) return null;
  return access;
}

export async function GET() {
  const access = await requireProducer();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ episodes: await listEpisodes() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load episodes" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}

export async function POST(request: Request) {
  const access = await requireProducer();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = CreateEpisodeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid episode", issues: parsed.error.flatten() }, { status: 400 });
  try {
    const result = await createEpisode({ ...parsed.data, createdBy: access.user!.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create episode" }, { status: error instanceof StudioPersistenceError ? 503 : 500 });
  }
}
