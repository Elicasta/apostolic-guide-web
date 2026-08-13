import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STUDIO_HOST = "studio.apostolicguide.com";
const STUDIO_PASSTHROUGH_ROUTES = new Set([
  "/login",
  "/forgot-password",
  "/update-password",
  "/favicon.ico"
]);

function requestHost(request: NextRequest) {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(":")[0]
    .toLowerCase();
}

function studioRewrite(request: NextRequest) {
  if (requestHost(request) !== STUDIO_HOST) return null;

  const pathname = request.nextUrl.pathname;

  if (
    STUDIO_PASSTHROUGH_ROUTES.has(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/guest/") ||
    pathname.startsWith("/output/")
  ) {
    return null;
  }

  if (pathname === "/studio" || pathname.startsWith("/studio/")) return null;

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/studio" : `/studio${pathname}`;
  return url;
}

export async function proxy(request: NextRequest) {
  const rewriteUrl = studioRewrite(request);
  const response = rewriteUrl
    ? NextResponse.rewrite(rewriteUrl, { request })
    : NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const isStudioHost = requestHost(request) === STUDIO_HOST;
  const needsAuthRefresh =
    isStudioHost || pathname.startsWith("/admin") || pathname.startsWith("/auth");

  if (!needsAuthRefresh) return response;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values: Array<{ name: string; value: string; options?: any }>) {
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js|map|woff|woff2)$).*)"
  ]
};
