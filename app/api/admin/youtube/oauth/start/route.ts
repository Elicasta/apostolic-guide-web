import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { getSocialPublishingCredentialValues } from "@/social-publishing-integrations";

export const runtime = "nodejs";

const CALLBACK_URL = "https://apostolicguide.com/api/admin/youtube/oauth/callback";
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

export async function GET() {
  const { access, allowed } = await getStudioPermission("manage_integrations");
  if (!allowed || access.state !== "allowed" || !access.user) {
    return NextResponse.redirect(new URL("/login", "https://apostolicguide.com"));
  }

  let credentials: Record<string, string>;
  try {
    credentials = await getSocialPublishingCredentialValues("youtube");
  } catch {
    return NextResponse.redirect(new URL("/admin/setup?youtube=credential_error", "https://apostolicguide.com"));
  }

  if (!credentials.clientId || !credentials.clientSecret) {
    return NextResponse.redirect(new URL("/admin/setup?youtube=missing_credentials", "https://apostolicguide.com"));
  }

  const state = randomBytes(32).toString("base64url");
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.searchParams.set("client_id", credentials.clientId);
  authorize.searchParams.set("redirect_uri", CALLBACK_URL);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", YOUTUBE_UPLOAD_SCOPE);
  authorize.searchParams.set("access_type", "offline");
  authorize.searchParams.set("include_granted_scopes", "true");
  authorize.searchParams.set("prompt", "consent");
  authorize.searchParams.set("state", state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set("ag_youtube_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/api/admin/youtube/oauth/callback"
  });
  return response;
}
