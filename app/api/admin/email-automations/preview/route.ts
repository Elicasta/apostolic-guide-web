import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { welcomeCopySchema } from "@/welcome-automation-config";
import { buildWelcomeEmail } from "@/welcome-email";

export async function POST(request: Request) {
  const permission = await getStudioPermission("view_distribution");
  if (!permission.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = welcomeCopySchema.safeParse((await request.json().catch(() => null))?.copy);
  if (!parsed.success) return NextResponse.json({ error: "Invalid welcome email fields." }, { status: 400 });
  const email = buildWelcomeEmail({ liveTeachings: true, newArticles: true, copy: parsed.data });
  return NextResponse.json({ html: email.html }, { headers: { "Cache-Control": "no-store" } });
}
