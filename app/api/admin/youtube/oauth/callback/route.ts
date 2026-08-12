import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { getSocialPublishingCredentialValues, saveSocialPublishingCredentials } from "@/social-publishing-integrations";

export const runtime = "nodejs";
export const maxDuration = 30;

const SITE_URL = "https://apostolicguide.com";
const CALLBACK_URL = `${SITE_URL}/api/admin/youtube/oauth/callback`;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type ChannelResponse = {
  items?: Array<{ id?: string; snippet?: { title?: string } }>;
};

function finish(path: string) {
  const response = NextResponse.redirect(new URL(path, SITE_URL));
  response.cookies.set("ag_youtube_oauth_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/api/admin/youtube/oauth/callback"
  });
  return response;
}

export async function GET(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_integrations");
  if (!allowed || access.state !== "allowed" || !access.user) return finish("/login");

  const url = new URL(request.url);
  if (url.searchParams.get("error")) return finish("/admin/setup?youtube=denied");

  const code = url.searchParams.get("code")?.trim();
  const returnedState = url.searchParams.get("state")?.trim();
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("ag_youtube_oauth_state")?.value?.trim();

  if (!code || !returnedState || !expectedState || returnedState !== expectedState) {
    return finish("/admin/setup?youtube=invalid_state");
  }

  try {
    const credentials = await getSocialPublishingCredentialValues("youtube");
    if (!credentials.clientId || !credentials.clientSecret) return finish("/admin/setup?youtube=missing_credentials");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: CALLBACK_URL,
        grant_type: "authorization_code"
      }),
      cache: "no-store"
    });
    const token = await tokenResponse.json().catch(() => ({})) as GoogleTokenResponse;
    if (!tokenResponse.ok || !token.access_token) {
      console.error("youtube oauth token exchange failed", token.error, token.error_description);
      return finish("/admin/setup?youtube=token_error");
    }

    const refreshToken = token.refresh_token?.trim() || credentials.refreshToken?.trim();
    if (!refreshToken) return finish("/admin/setup?youtube=no_refresh_token");

    let channelId = credentials.channelId?.trim() || "";
    let channelTitle = credentials.channelTitle?.trim() || "";
    try {
      const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true", {
        headers: { authorization: `Bearer ${token.access_token}` },
        cache: "no-store"
      });
      if (channelResponse.ok) {
        const channel = await channelResponse.json() as ChannelResponse;
        const first = channel.items?.[0];
        channelId = first?.id?.trim() || channelId;
        channelTitle = first?.snippet?.title?.trim() || channelTitle;
      }
    } catch {
      // Channel discovery is helpful but not required for a valid upload authorization.
    }

    await saveSocialPublishingCredentials("youtube", {
      refreshToken,
      channelId,
      channelTitle
    });

    return finish("/admin/setup?youtube=connected");
  } catch (error) {
    console.error("youtube oauth callback failed", error instanceof Error ? error.message : error);
    return finish("/admin/setup?youtube=server_error");
  }
}
