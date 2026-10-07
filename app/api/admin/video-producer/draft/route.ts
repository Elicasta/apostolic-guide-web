import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import {
  advanceProducerDraft,
  startProducerDraft,
} from "@/video-producer-draft-server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = z
    .object({ projectId: z.string().uuid() })
    .safeParse(await request.json().catch(() => null));
  if (!input.success)
    return NextResponse.json({ error: "Invalid project." }, { status: 400 });
  try {
    const job = await startProducerDraft(
      input.data.projectId,
      access.user.id,
      new URL(request.url).origin,
    );
    after(async () => {
      await advanceProducerDraft(input.data.projectId).catch((error) =>
        console.error("Draft kickoff failed", error),
      );
    });
    return NextResponse.json({ job }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start draft.",
      },
      { status: 409 },
    );
  }
}
