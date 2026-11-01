import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { getThreadsCredentialStatus, saveThreadsAppCredentials } from "@/threads-meta";

export const runtime = "nodejs";

async function allowed() {
  const result = await getStudioPermission("manage_integrations");
  return result.allowed && result.access.state === "allowed" && result.access.user;
}

export async function GET() {
  if (!await allowed()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json({ status: await getThreadsCredentialStatus() }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Threads setup could not be loaded." }, { status: 500 }); }
}

const schema = z.object({
  appId: z.string().trim().max(200).optional(),
  appSecret: z.string().trim().max(1000).optional()
});

export async function POST(request: Request) {
  if (!await allowed()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Threads app credential update." }, { status: 400 });
  try { return NextResponse.json({ status: await saveThreadsAppCredentials(parsed.data) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Threads credentials could not be saved." }, { status: 500 }); }
}
