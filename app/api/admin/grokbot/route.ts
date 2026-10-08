import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { executeOperatorCommand } from "@/lib/operator/execute";
import { listOperatorSessions, readOperatorSession } from "@/lib/operator/session";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";

const bodySchema = z.object({
  command: z.string().trim().min(1).max(500).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().uuid().optional(),
  requestId: z.string().trim().min(8).max(80).optional(),
  context: z.object({
    pathwaySlug: z.string().trim().min(1).max(80).nullable().optional(),
    projectId: z.string().trim().min(1).max(80).nullable().optional(),
    planId: z.string().uuid().nullable().optional()
  }).optional()
}).refine((value) => Boolean(value.command || value.action), { message: "A command or action is required." });

async function requireReader() {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user || !access.role || !hasStudioPermission(access.role, "view_workspace")) return null;
  return access;
}

function persistenceStatus(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "OperatorPersistenceUnavailable") return 503;
  if (name === "OperatorSessionInvalid") return 400;
  if (name === "OperatorSessionArchived") return 409;
  if (name === "OperatorSessionMissing" || name === "OperatorSessionDenied") return 404;
  return 400;
}

export async function GET(request: Request) {
  const access = await requireReader();
  if (!access?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") || "";
  try {
    if (!sessionId) {
      const limit = Number(url.searchParams.get("limit") || 20);
      const sessions = await listOperatorSessions(access.user.id, Number.isFinite(limit) ? limit : 20);
      return NextResponse.json({ sessions });
    }
    if (!z.string().uuid().safeParse(sessionId).success) return NextResponse.json({ error: "A session id is required." }, { status: 400 });
    const accessResult = await readOperatorSession(sessionId, access.user.id);
    if (accessResult.status === "missing" || accessResult.status === "denied") {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json({ session: accessResult.session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grokbot could not read that session.";
    return NextResponse.json({ error: message }, { status: persistenceStatus(error) });
  }
}

export async function POST(request: Request) {
  const access = await requireReader();
  if (!access?.user || !access.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin Grokbot commands are not permitted." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Grokbot command." }, { status: 400 });
  try {
    const result = await executeOperatorCommand({
      command: parsed.data.command,
      action: parsed.data.action,
      input: parsed.data.input,
      actor: { userId: access.user.id, role: access.role },
      sessionId: parsed.data.sessionId,
      requestId: parsed.data.requestId,
      context: parsed.data.context
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Grokbot could not run that command.";
    return NextResponse.json({ error: message }, { status: persistenceStatus(error) });
  }
}
