import "server-only";
import { issueSignedToken, presignUrl } from "@vercel/blob";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 60 * 60 * 1000;

export async function privateBlobReadUrl(pathname: string, ttlMs = DEFAULT_TTL_MS) {
  const cleanPath = pathname.trim();
  if (!cleanPath) throw new Error("Private Blob pathname is missing.");
  const boundedTtl = Math.max(60_000, Math.min(MAX_TTL_MS, ttlMs));
  const validUntil = Date.now() + boundedTtl;
  const signedToken = await issueSignedToken({
    pathname: cleanPath,
    operations: ["get"],
    validUntil
  });
  const { presignedUrl } = await presignUrl(signedToken, {
    operation: "get",
    pathname: cleanPath,
    access: "private",
    validUntil
  });
  return presignedUrl;
}
