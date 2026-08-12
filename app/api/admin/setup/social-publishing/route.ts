import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import {
  getSocialPublishingCredentialStatus,
  saveSocialPublishingCredentials,
  type SocialPublishingPlatform
} from "@/social-publishing-integrations";

export const runtime = "nodejs";

const platformSchema = z.enum(["youtube", "instagram", "tiktok"]);
const schema = z.object({
  platform: platformSchema,
  values: z.record(z.string(), z.string().max(5000)).default({})
});

async function permission() {
  const result = await getStudioPermission("manage_integrations");
  return result.allowed && result.access.state === "allowed" && result.access.user;
}

export async function GET() {
  if (!await permission()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ platforms: await getSocialPublishingCredentialStatus() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Credentials could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await permission()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credential update." }, { status: 400 });

  try {
    const platforms = await saveSocialPublishingCredentials(
      parsed.data.platform as SocialPublishingPlatform,
      parsed.data.values
    );
    return NextResponse.json({ platforms });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Credentials could not be saved." }, { status: 500 });
  }
}
