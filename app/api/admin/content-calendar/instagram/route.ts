import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { syncInstagramFeedToCalendar } from "@/instagram-feed-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const result = await syncInstagramFeedToCalendar(48);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Instagram feed sync failed." }, { status: 502 });
  }
}
