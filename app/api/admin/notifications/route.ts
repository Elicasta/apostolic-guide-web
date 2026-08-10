import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAccess } from "@/auth";
import { markAllStudioNotificationsRead, markStudioNotificationRead } from "@/studio-notifications";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), id: z.number().int().positive() }),
  z.object({ action: z.literal("read_all") })
]);

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (access.state !== "allowed") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (parsed.data.action === "read_all") await markAllStudioNotificationsRead();
  else await markStudioNotificationRead(parsed.data.id);
  return NextResponse.json({ ok: true });
}
