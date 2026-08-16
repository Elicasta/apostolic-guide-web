export const PATHWAY_ASSET_INGEST_BUCKET = "studio-pathway-assets";
export const PATHWAY_ASSET_TUS_CHUNK_BYTES = 6 * 1024 * 1024;
export const PATHWAY_ASSET_ENGINE_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
// The connected Supabase organization is currently on the Free plan, whose
// global Storage ceiling is 50 MB. Keep the engine ceiling separate so a
// storage-plan upgrade is a capacity change, not an ingest rewrite.
export const PATHWAY_ASSET_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const PATHWAY_ASSET_HASH_LIMIT_BYTES = 64 * 1024 * 1024;

export type PathwayAssetIngestStudio = "carousel" | "video";
export type PathwayAssetMediaKind = "image" | "video" | "audio" | "document" | "archive";
export type PathwayAssetIngestType = "uploaded-image" | "uploaded-video" | "source-audio" | "source-document" | "source-archive";

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "application/pdf",
  "application/zip"
]);

export function isSupportedPathwayAssetMime(mimeType: string) {
  return SUPPORTED_MIME_TYPES.has(mimeType.trim().toLowerCase());
}

export function pathwayAssetMediaKind(mimeType: string): PathwayAssetMediaKind | null {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "document";
  if (mime === "application/zip") return "archive";
  return null;
}

export function pathwayAssetIngestType(mimeType: string): PathwayAssetIngestType | null {
  const kind = pathwayAssetMediaKind(mimeType);
  if (kind === "image") return "uploaded-image";
  if (kind === "video") return "uploaded-video";
  if (kind === "audio") return "source-audio";
  if (kind === "document") return "source-document";
  if (kind === "archive") return "source-archive";
  return null;
}

export function pathwayAssetIngestStudio(mimeType: string, requested: PathwayAssetIngestStudio): PathwayAssetIngestStudio {
  const kind = pathwayAssetMediaKind(mimeType);
  return kind === "video" || kind === "audio" ? "video" : requested;
}

export function sanitizePathwayAssetFilename(value: string) {
  const trimmed = value.trim();
  const dot = trimmed.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < trimmed.length - 1;
  const rawBase = hasExtension ? trimmed.slice(0, dot) : trimmed;
  const rawExtension = hasExtension ? trimmed.slice(dot + 1) : "";
  const base = rawBase
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 90) || "asset";
  const extension = rawExtension.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 10);
  return extension ? `${base}.${extension}` : base;
}

export function pathwayAssetClientFingerprint(input: { name: string; size: number; lastModified: number; mimeType: string }) {
  return [input.name.trim().toLowerCase(), input.size, input.lastModified, input.mimeType.trim().toLowerCase()].join(":");
}

export function pathwayAssetDisplayKind(mimeType: string) {
  const kind = pathwayAssetMediaKind(mimeType);
  if (kind === "image") return "Image source";
  if (kind === "video") return "Video master";
  if (kind === "audio") return "Audio source";
  if (kind === "document") return "Reference document";
  if (kind === "archive") return "Project archive";
  return "Media source";
}

export function humanPathwayAssetBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function humanPathwayAssetDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}
