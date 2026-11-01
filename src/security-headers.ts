/**
 * Document security headers shared by the public site and Studio.
 *
 * Camera and microphone stay disabled on the public site. Studio live
 * production and the guest green room call getUserMedia, so those routes
 * must explicitly allow capture on the same origin. A global `camera=()`
 * policy makes the browser reject those calls before the permission prompt.
 */
export const LOCKED_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=()";
export const MEDIA_CAPTURE_PERMISSIONS_POLICY = "camera=(self), microphone=(self), geolocation=(), payment=()";

const MEDIA_CAPTURE_PREFIXES = ["/guest/", "/studio/sessions/", "/sessions/"] as const;

export function mediaCaptureAllowed(pathname: string) {
  const path = pathname.split(/[?#]/, 1)[0] ?? pathname;
  return MEDIA_CAPTURE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function permissionsPolicyForPath(pathname: string) {
  return mediaCaptureAllowed(pathname)
    ? MEDIA_CAPTURE_PERMISSIONS_POLICY
    : LOCKED_PERMISSIONS_POLICY;
}

export function permissionsPolicyForPaths(paths: Array<string | null | undefined>) {
  return paths.some((path) => typeof path === "string" && mediaCaptureAllowed(path))
    ? MEDIA_CAPTURE_PERMISSIONS_POLICY
    : LOCKED_PERMISSIONS_POLICY;
}
