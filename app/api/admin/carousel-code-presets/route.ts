import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { codeSchema } from "@/carousel-code";
export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Supabase unavailable" },
      { status: 503 },
    );
  const r = await service
    .from("studio_carousel_code_presets")
    .select("id,name,theme")
    .eq("created_by", access.user.id)
    .order("created_at", { ascending: false });
  return r.error
    ? NextResponse.json({ error: r.error.message }, { status: 503 })
    : NextResponse.json({ presets: r.data });
}
export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (!service)
    return NextResponse.json(
      { error: "Supabase unavailable" },
      { status: 503 },
    );
  const parsed = z
    .object({ name: z.string().trim().min(1).max(100), theme: codeSchema })
    .safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a name and valid theme" },
      { status: 400 },
    );
  const theme = {
    ...parsed.data.theme,
    overrides: {},
    assets: parsed.data.theme.assets,
  };
  const r = await service
    .from("studio_carousel_code_presets")
    .insert({ created_by: access.user.id, name: parsed.data.name, theme })
    .select("id,name,theme")
    .single();
  return r.error
    ? NextResponse.json({ error: r.error.message }, { status: 400 })
    : NextResponse.json({ preset: r.data });
}
