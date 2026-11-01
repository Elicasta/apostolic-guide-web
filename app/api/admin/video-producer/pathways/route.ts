import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { allPathways } from "@/pathway-catalog";

export const runtime = "nodejs";

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    pathways: allPathways.map((pathway) => ({
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      steps: pathway.steps.map((step) => ({ title: step.title, reference: step.reference }))
    }))
  });
}
