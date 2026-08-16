import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { cancelSolRuntimeRun, resumeSolRuntimeRun } from "@/sol-runtime-control";
import { runSolRuntimeWorker } from "@/sol-runtime-worker";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["cancel","resume"]) });

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.user || !access.role || !hasStudioPermission(access.role, "manage_content")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid runtime action." }, { status: 400 });
  const { runId } = await context.params;
  try {
    if (parsed.data.action === "cancel") return NextResponse.json({ ok: true, result: await cancelSolRuntimeRun(runId, access.user.id) });
    const result = await resumeSolRuntimeRun(runId, access.user.id);
    after(() => runSolRuntimeWorker({ maxTasks: 12 }).catch((error) => console.error("SOL Runtime resume wake failed", error)));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Runtime action failed." }, { status: 500 });
  }
}
