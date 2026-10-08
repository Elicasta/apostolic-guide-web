import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { executeOperatorCommand } from "@/lib/operator/execute";
import { readOperatorSession } from "@/lib/operator/session";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";

const bodySchema = z.object({
  command: z.string().trim().min(1).max(500),
  sessionId: z.string().uuid().optional(),
  context: z.object({
    pathwaySlug: z.string().trim().min(1).max(80).nullable().optional(),
    projectId: z.string().trim().min(1).max(80).nullable().optional()
  }).optional()
});

async function requireReader() {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user || !access.role || !hasStudioPermission(access.role, "view_workspace")) return null;
  return access;
}

export async function GET(request: Request) {
  const access = await requireReader();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!z.string().uuid().safeParse(sessionId).success) return NextResponse.json({ error: "A session id is required." }, { status: 400 });
  const session = readOperatorSession(sessionId, access.user.id);
  if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ session });
}

export async function POST(request: Request) {
  const access = await requireReader();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin Grokbot commands are not permitted." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Grokbot command." }, { status: 400 });
  try {
    const result = await executeOperatorCommand({
      command: parsed.data.command,
      actor: { userId: access.user.id, role: access.role },
      sessionId: parsed.data.sessionId,
      context: parsed.data.context
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grokbot could not run that command.";
    const status = error instanceof Error && error.name === "OperatorSessionDenied" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
