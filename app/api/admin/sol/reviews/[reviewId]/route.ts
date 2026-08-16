import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { resolveSolRuntimeApproval } from "@/sol-runtime-approval";
import { getSolRuntimeReview } from "@/sol-runtime-review";
import { runSolRuntimeWorker } from "@/sol-runtime-worker";
import { hasStudioPermission } from "@/studio-permissions";

export const runtime = "nodejs";

const decisionSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  note: z.string().trim().max(2000).optional()
});

async function access() {
  const result = await getAdminAccess();
  if (result.state !== "allowed" || !result.user || !result.role || !hasStudioPermission(result.role, "view_workspace")) return null;
  return result;
}

export async function GET(_request: Request, context: { params: Promise<{ reviewId: string }> }) {
  const current = await access();
  if (!current) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { reviewId } = await context.params;
  try {
    const review = await getSolRuntimeReview(reviewId);
    if (!review) return NextResponse.json({ error: "Review not found." }, { status: 404 });
    return NextResponse.json({ review, canOperate: hasStudioPermission(current.role, "manage_content") });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load SOL review." }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ reviewId: string }> }) {
  const current = await access();
  if (!current) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!hasStudioPermission(current.role, "manage_content")) return NextResponse.json({ error: "Your Studio role cannot resolve reviews." }, { status: 403 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });
  if (parsed.data.decision === "changes_requested" && !parsed.data.note?.trim()) return NextResponse.json({ error: "Request Changes requires a note." }, { status: 400 });
  const { reviewId } = await context.params;
  try {
    const review = await resolveSolRuntimeApproval({ reviewId, userId: current.user.id, decision: parsed.data.decision, note: parsed.data.note });
    if (parsed.data.decision !== "rejected") after(() => runSolRuntimeWorker({ maxTasks: parsed.data.decision === "changes_requested" ? 12 : 6 }).catch((error) => console.error("SOL Runtime approval wake failed", error)));
    return NextResponse.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve SOL review.";
    return NextResponse.json({ error: message }, { status: message.includes("already") ? 409 : 500 });
  }
}
