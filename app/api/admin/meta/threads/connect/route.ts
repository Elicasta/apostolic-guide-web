import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { getThreadsAppCredentials, THREADS_REDIRECT_URI, THREADS_SCOPES } from "@/threads-meta";

export const runtime = "nodejs";

export async function GET() {
  const permission = await getStudioPermission("manage_integrations");
  if (!permission.allowed || permission.access.state !== "allowed" || !permission.access.user) {
    return NextResponse.redirect(new URL("/admin/setup?threads=forbidden", "https://apostolicguide.com"));
  }

  const credentials = await getThreadsAppCredentials();
  if (!credentials.appId || !credentials.appSecret) {
    return NextResponse.redirect(new URL("/admin/setup?threads=missing_credentials#social-publishing", "https://apostolicguide.com"));
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const authorization = new URL("https://threads.net/oauth/authorize");
  authorization.searchParams.set("client_id", credentials.appId);
  authorization.searchParams.set("redirect_uri", THREADS_REDIRECT_URI);
  authorization.searchParams.set("scope", THREADS_SCOPES.join(","));
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("state", state);

  const response = NextResponse.redirect(authorization);
  response.cookies.set("ag_threads_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60
  });
  return response;
}
