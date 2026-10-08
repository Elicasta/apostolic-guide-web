import { isSupportedPathwayAssetMime, PATHWAY_ASSET_MAX_UPLOAD_BYTES, pathwayAssetClientFingerprint, pathwayAssetIngestStudio } from "@/pathway-asset-ingest";

export const FAST_IMAGE_BYTES = 8 * 1024 * 1024;
const FAST_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export function sniffImageMime(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "image/webp";
  return null;
}

export function classifyWorkbenchFile(file: { type: string; size: number }) {
  const mime = file.type.trim().toLowerCase();
  if (!mime || !isSupportedPathwayAssetMime(mime)) {
    return { ok: false as const, error: "That file type is not accepted by Pathway Assets." };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false as const, error: "The file is empty." };
  if (file.size > PATHWAY_ASSET_MAX_UPLOAD_BYTES) return { ok: false as const, error: "That file is larger than the Pathway Asset limit." };
  if (FAST_IMAGE_TYPES.has(mime) && file.size <= FAST_IMAGE_BYTES) return { ok: true as const, route: "pathway-upload" as const };
  return { ok: true as const, route: "pathway-ingest" as const };
}

export type WorkbenchUploadResult = {
  assetId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  previewUrl: string | null;
  duplicate: boolean;
};

type Progress = { phase: "reading" | "uploading" | "finalizing"; percent: number };

async function postJson(url: string, body: unknown, onUploadProgress?: (loaded: number, total: number) => void) {
  const payload = JSON.stringify(body);
  return new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onUploadProgress?.(event.loaded, event.total);
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>; } catch { data = {}; }
      resolve({ status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error("Upload failed before the server responded."));
    xhr.send(payload);
  });
}

function readFile(file: File) {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

export async function uploadWorkbenchFile(input: {
  file: File;
  pathwaySlug: string;
  studio?: "carousel" | "video";
  onProgress?: (progress: Progress) => void;
}): Promise<WorkbenchUploadResult> {
  const classified = classifyWorkbenchFile(input.file);
  if (!classified.ok) throw new Error(classified.error);
  input.onProgress?.({ phase: "reading", percent: 5 });

  if (classified.route === "pathway-upload") {
    const bytes = await readFile(input.file);
    const sniffed = sniffImageMime(bytes);
    if (!sniffed || sniffed !== input.file.type.trim().toLowerCase()) {
      throw new Error("The file contents do not match a PNG, JPEG, or WebP image.");
    }
    let binary = "";
    const chunk = 0x2000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    const response = await postJson("/api/admin/pathway-assets/upload", {
      pathwaySlug: input.pathwaySlug,
      studio: input.studio || "carousel",
      assetType: "uploaded-image",
      title: input.file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 180) || "Workbench image",
      dataUrl: `data:${sniffed};base64,${btoa(binary)}`,
      sourceType: "uploaded",
      metadata: { filename: input.file.name, mime: sniffed, bytes: input.file.size, grokbot: true }
    }, (loaded, total) => input.onProgress?.({ phase: "uploading", percent: Math.round((loaded / Math.max(total, 1)) * 90) }));
    if (response.status === 409 && typeof response.data.duplicateAssetId === "string") {
      return {
        assetId: response.data.duplicateAssetId,
        filename: input.file.name,
        mimeType: sniffed,
        bytes: input.file.size,
        previewUrl: null,
        duplicate: true
      };
    }
    const asset = response.data.asset as { id?: string; preview_url?: string | null } | undefined;
    if (!response.status || response.status >= 400 || !asset?.id) {
      throw new Error(typeof response.data.error === "string" ? response.data.error : "Upload did not return an asset id.");
    }
    return {
      assetId: asset.id,
      filename: input.file.name,
      mimeType: sniffed,
      bytes: input.file.size,
      previewUrl: typeof asset.preview_url === "string" ? asset.preview_url : null,
      duplicate: false
    };
  }

  const { upload } = await import("@vercel/blob/client");
  const fingerprint = pathwayAssetClientFingerprint({
    name: input.file.name,
    size: input.file.size,
    lastModified: input.file.lastModified,
    mimeType: input.file.type
  });
  const prepared = await postJson("/api/admin/pathway-assets/ingest", {
    action: "prepare",
    pathwaySlug: input.pathwaySlug,
    studio: pathwayAssetIngestStudio(input.file.type, input.studio || "carousel"),
    fileName: input.file.name,
    mimeType: input.file.type,
    fileSize: input.file.size,
    lastModified: input.file.lastModified,
    clientFingerprint: fingerprint
  });
  if (prepared.status >= 400) throw new Error(typeof prepared.data.error === "string" ? prepared.data.error : "Pathway ingest did not prepare a private upload.");
  const session = prepared.data.session as { id?: string } | undefined;
  const pathname = String(prepared.data.pathname || "");
  if (!session?.id || !pathname) throw new Error("Pathway ingest did not return a private upload destination.");
  input.onProgress?.({ phase: "uploading", percent: 15 });
  await upload(pathname, input.file, {
    access: "private",
    handleUploadUrl: "/api/admin/pathway-assets/ingest-upload",
    clientPayload: JSON.stringify({ sessionId: session.id }),
    contentType: input.file.type,
    multipart: true,
    onUploadProgress: ({ percentage }) => input.onProgress?.({ phase: "uploading", percent: Math.max(15, Math.min(90, percentage)) })
  });
  input.onProgress?.({ phase: "finalizing", percent: 95 });
  let finalized: { status: number; data: Record<string, unknown> } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    finalized = await postJson("/api/admin/pathway-assets/ingest", { action: "finalize", sessionId: session.id });
    if (finalized.status < 400 && (finalized.data.assetId || (finalized.data.asset as { id?: string } | undefined)?.id)) break;
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  const assetId = String(finalized?.data.assetId || (finalized?.data.asset as { id?: string } | undefined)?.id || "");
  if (!assetId) throw new Error(typeof finalized?.data.error === "string" ? finalized.data.error : "Finalization did not return an asset id.");
  return {
    assetId,
    filename: input.file.name,
    mimeType: input.file.type,
    bytes: input.file.size,
    previewUrl: `/api/admin/pathway-assets/file?id=${assetId}`,
    duplicate: Boolean(prepared.data.duplicateAsset)
  };
}
