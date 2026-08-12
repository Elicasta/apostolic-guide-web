import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";

const TOKEN_NAME = "video_studio_github_token";
const REPOSITORY_NAME = "video_studio_github_repository";

const schema = z.object({
  token: z.string().max(5000).optional().default(""),
  repository: z.string().max(300).optional().default("")
});

async function permission() {
  const result = await getStudioPermission("manage_integrations");
  return result.allowed && result.access.state === "allowed" && result.access.user;
}

async function status() {
  const envToken = Boolean(process.env.VIDEO_STUDIO_GITHUB_TOKEN?.trim());
  const envRepository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "";
  const service = createServiceClient();
  if (!service) return {
    configured: envToken,
    source: envToken ? "environment" : "missing",
    tokenStored: envToken,
    repositoryStored: Boolean(envRepository),
    repository: envRepository || "Elicasta/apostolic-guide-web",
    updatedAt: null
  };

  const { data, error } = await service.schema("analytics").from("integration_secrets")
    .select("name,secret,updated_at")
    .in("name", [TOKEN_NAME, REPOSITORY_NAME]);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const values = new Map(rows.map((row) => [row.name, row.secret]));
  const updatedAt = rows.map((row) => row.updated_at).filter(Boolean).sort().at(-1) ?? null;
  const storedToken = Boolean(values.get(TOKEN_NAME)?.trim());
  const storedRepository = values.get(REPOSITORY_NAME)?.trim() || "";
  return {
    configured: envToken || storedToken,
    source: envToken ? "environment" : storedToken ? "secret_store" : "missing",
    tokenStored: envToken || storedToken,
    repositoryStored: Boolean(envRepository || storedRepository),
    repository: envRepository || storedRepository || "Elicasta/apostolic-guide-web",
    updatedAt
  };
}

export async function GET() {
  if (!await permission()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ renderer: await status() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Renderer status could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await permission()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid renderer credential update." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const now = new Date().toISOString();
  const rows = [] as Array<{ name: string; secret: string; updated_at: string }>;
  const token = parsed.data.token.trim();
  const repository = parsed.data.repository.trim();
  if (token) rows.push({ name: TOKEN_NAME, secret: token, updated_at: now });
  if (repository) rows.push({ name: REPOSITORY_NAME, secret: repository, updated_at: now });

  try {
    if (rows.length) {
      const { error } = await service.schema("analytics").from("integration_secrets").upsert(rows, { onConflict: "name" });
      if (error) throw new Error(error.message);
    }
    return NextResponse.json({ renderer: await status() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Renderer credentials could not be saved." }, { status: 500 });
  }
}
