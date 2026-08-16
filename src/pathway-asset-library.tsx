"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bookmark,
  CalendarPlus,
  Check,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers3,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Share2,
  Sparkles,
  Star,
  Tags,
  Trash2,
  Upload,
  WandSparkles,
  X
} from "lucide-react";
import { collectPathwayAssetDeleteIds } from "@/pathway-asset-delete";
import {
  assetAltText,
  assetDescription,
  assetIsFavorite,
  assetMatchesQuery,
  assetTags,
  parseAssetTagInput
} from "@/pathway-asset-metadata";

type Studio = "carousel" | "video";
type StudioScope = "all" | Studio;
type AssetStatus = "draft" | "review" | "approved" | "ready" | "published" | "archived";
type AssetGroup = "all" | "visual" | "copy" | "output";
type StatusFilter = "all" | Exclude<AssetStatus, "archived">;
type SortKey = "updated" | "title" | "status";
type LatestUsage = {
  id?: string;
  title?: string;
  status?: string;
  platform?: string | null;
  scheduled_for?: string | null;
  published_at?: string | null;
  updated_at?: string;
};
type PathwayAsset = {
  id: string;
  pathway_slug: string;
  studio: Studio;
  asset_type: string;
  parent_asset_id: string | null;
  title: string;
  status: AssetStatus;
  source_type: string;
  editable: boolean;
  version: number;
  content: Record<string, unknown>;
  storage_bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  preview_url?: string | null;
  prompt: string | null;
  model: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
  is_style_reference?: boolean;
  usage_count?: number;
  latest_usage?: LatestUsage | null;
};
type GeneratedImage = {
  dataUrl: string;
  prompt: string;
  solModel: string;
  imageModel: string;
  size: string;
  referenceCount?: number;
};
type AssetPatch = {
  title?: string;
  status?: AssetStatus;
  favorite?: boolean;
  description?: string;
  altText?: string;
  tags?: string[];
  archive?: boolean;
};
type AssetEnrichment = {
  suggestedTitle: string;
  description: string;
  altText: string;
  tags: string[];
  confidence: number;
};
type SavedViewFilters = {
  query: string;
  studioScope: StudioScope;
  group: AssetGroup;
  status: StatusFilter;
  favoritesOnly: boolean;
  sort: SortKey;
};
type SavedView = {
  id: string;
  pathway_slug: string;
  name: string;
  filters: SavedViewFilters;
  created_at: string;
  updated_at: string;
};

const STATUS_OPTIONS: Exclude<AssetStatus, "archived">[] = ["draft", "review", "approved", "ready", "published"];
const STATUS_ORDER: Record<AssetStatus, number> = { draft: 0, review: 1, approved: 2, ready: 3, published: 4, archived: 5 };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

function assetGroup(type: string): Exclude<AssetGroup, "all"> | "other" {
  if (type === "caption") return "copy";
  if (type.includes("image") || type.includes("slide") || type.includes("post") || type.includes("story") || type.includes("thumbnail")) return "visual";
  if (type.includes("render") || type.includes("project") || type.includes("deck") || type.includes("set")) return "output";
  return "other";
}

function calendarType(asset: PathwayAsset) {
  if (asset.asset_type === "carousel-deck") return "carousel";
  if (asset.asset_type === "story-set" || asset.asset_type === "story-frame") return "story";
  if (asset.asset_type === "single-post") return "post";
  if (asset.asset_type.includes("thumbnail")) return "thumbnail";
  if (asset.asset_type === "video-render") return "video";
  if (asset.asset_type.includes("image")) return "image";
  return null;
}

function filenameFromDisposition(value: string | null, fallback: string) {
  const quoted = value?.match(/filename="([^"]+)"/i)?.[1];
  const plain = value?.match(/filename=([^;]+)/i)?.[1]?.trim();
  return quoted || plain || fallback;
}

function humanBytes(value: unknown) {
  const bytes = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeSavedFilters(value: unknown): SavedViewFilters {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const studioScope = source.studioScope === "carousel" || source.studioScope === "video" ? source.studioScope : "all";
  const group = source.group === "visual" || source.group === "copy" || source.group === "output" ? source.group : "all";
  const status = STATUS_OPTIONS.includes(source.status as Exclude<AssetStatus, "archived">) ? source.status as StatusFilter : "all";
  const sort = source.sort === "title" || source.sort === "status" ? source.sort : "updated";
  return {
    query: typeof source.query === "string" ? source.query : "",
    studioScope,
    group,
    status,
    favoritesOnly: source.favoritesOnly === true,
    sort
  };
}

export function PathwayAssetLibrary({
  pathwaySlug,
  pathwayTitle,
  studio,
  aiReady,
  onOpenAsset
}: {
  pathwaySlug: string;
  pathwayTitle: string;
  studio: Studio;
  aiReady: boolean;
  onOpenAsset?: (asset: PathwayAsset) => void;
}) {
  const [assets, setAssets] = useState<PathwayAsset[]>([]);
  const [studioScope, setStudioScope] = useState<StudioScope>("all");
  const [filter, setFilter] = useState<AssetGroup>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState("");
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatus, setBulkStatus] = useState<Exclude<AssetStatus, "archived">>("review");
  const [bulkTags, setBulkTags] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageType, setImageType] = useState<"single-post" | "story" | "thumbnail" | "background">(studio === "video" ? "thumbnail" : "single-post");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [detailAltText, setDetailAltText] = useState("");
  const [detailTags, setDetailTags] = useState("");
  const [detailStatus, setDetailStatus] = useState<AssetStatus>("draft");
  const [enrichment, setEnrichment] = useState<AssetEnrichment | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const deleteInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setImageType(studio === "video" ? "thumbnail" : "single-post");
  }, [studio]);

  const selectedAsset = useMemo(() => assets.find((asset) => asset.id === inspectId) ?? null, [assets, inspectId]);
  const selectedParent = useMemo(() => selectedAsset?.parent_asset_id ? assets.find((asset) => asset.id === selectedAsset.parent_asset_id) ?? null : null, [assets, selectedAsset]);
  const selectedChildren = useMemo(() => selectedAsset ? assets.filter((asset) => asset.parent_asset_id === selectedAsset.id) : [], [assets, selectedAsset]);

  useEffect(() => {
    setEnrichment(null);
    if (!selectedAsset) return;
    setDetailTitle(selectedAsset.title);
    setDetailDescription(assetDescription(selectedAsset.metadata));
    setDetailAltText(assetAltText(selectedAsset.metadata));
    setDetailTags(assetTags(selectedAsset.metadata).join(", "));
    setDetailStatus(selectedAsset.status);
  }, [selectedAsset]);

  const visible = useMemo(() => assets.filter((asset) => {
    if (studioScope !== "all" && asset.studio !== studioScope) return false;
    if (filter !== "all" && assetGroup(asset.asset_type) !== filter) return false;
    if (statusFilter !== "all" && asset.status !== statusFilter) return false;
    if (favoritesOnly && !assetIsFavorite(asset.metadata)) return false;
    if (!assetMatchesQuery(asset, query)) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.title.localeCompare(b.title);
    return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  }), [assets, favoritesOnly, filter, query, sort, statusFilter, studioScope]);

  const parentCount = assets.filter((asset) => !asset.parent_asset_id).length;
  const carouselCount = assets.filter((asset) => asset.studio === "carousel").length;
  const videoCount = assets.filter((asset) => asset.studio === "video").length;
  const favoriteCount = assets.filter((asset) => assetIsFavorite(asset.metadata)).length;
  const inUseCount = assets.filter((asset) => Number(asset.usage_count || 0) > 0).length;
  const selectedVisibleCount = visible.filter((asset) => selectedIds.has(asset.id)).length;

  function clearActiveView() {
    setActiveViewId("");
  }

  function currentFilters(): SavedViewFilters {
    return { query, studioScope, group: filter, status: statusFilter, favoritesOnly, sort };
  }

  async function refresh() {
    if (!pathwaySlug) return;
    setBusy("load");
    try {
      const [carouselResponse, videoResponse] = await Promise.all([
        fetch(`/api/admin/pathway-assets?pathwaySlug=${encodeURIComponent(pathwaySlug)}&studio=carousel`, { cache: "no-store" }),
        fetch(`/api/admin/pathway-assets?pathwaySlug=${encodeURIComponent(pathwaySlug)}&studio=video`, { cache: "no-store" })
      ]);
      const [carouselData, videoData] = await Promise.all([
        carouselResponse.json().catch(() => ({})),
        videoResponse.json().catch(() => ({}))
      ]);
      if (!carouselResponse.ok) throw new Error(carouselData.error || "Carousel assets could not be loaded.");
      if (!videoResponse.ok) throw new Error(videoData.error || "Video assets could not be loaded.");
      const next = [
        ...(Array.isArray(carouselData.assets) ? carouselData.assets : []),
        ...(Array.isArray(videoData.assets) ? videoData.assets : [])
      ].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))) as PathwayAsset[];
      setAssets(next);
      const validIds = new Set(next.map((asset) => asset.id));
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => validIds.has(id))));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Assets could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshViews() {
    if (!pathwaySlug) return;
    try {
      const response = await fetch(`/api/admin/pathway-assets/views?pathwaySlug=${encodeURIComponent(pathwaySlug)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Saved views could not be loaded.");
      setSavedViews((Array.isArray(data.views) ? data.views : []).map((view: SavedView) => ({ ...view, filters: normalizeSavedFilters(view.filters) })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Saved views could not be loaded.");
    }
  }

  useEffect(() => {
    setSelectedIds(new Set());
    setInspectId(null);
    setActiveViewId("");
    setShowSaveView(false);
    setViewName("");
    void refresh();
    void refreshViews();
  }, [pathwaySlug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patchAsset(asset: PathwayAsset, patch: AssetPatch, successMessage?: string) {
    const key = patch.archive ? `archive:${asset.id}` : `patch:${asset.id}`;
    setBusy(key);
    try {
      const response = await fetch("/api/admin/pathway-assets", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id, ...patch })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Asset could not be updated.");
      if (patch.archive) {
        setAssets((current) => current.filter((item) => item.id !== asset.id));
        setSelectedIds((current) => {
          const next = new Set(current);
          next.delete(asset.id);
          return next;
        });
        if (inspectId === asset.id) setInspectId(null);
      } else {
        const next = {
          ...(data.asset as PathwayAsset),
          is_style_reference: asset.is_style_reference,
          usage_count: asset.usage_count,
          latest_usage: asset.latest_usage
        };
        setAssets((current) => current.map((item) => item.id === asset.id ? next : item));
      }
      if (successMessage) setMessage(successMessage);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset could not be updated.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function deleteAsset(asset: PathwayAsset) {
    const deleteIds = collectPathwayAssetDeleteIds(asset.id, assets);
    const deleteIdSet = new Set(deleteIds);
    const deletingAssets = assets.filter((item) => deleteIdSet.has(item.id));
    const published = deletingAssets.find((item) => item.status === "published");
    if (published) {
      setMessage(`${published.title} is published. Archive published assets instead of deleting them.`);
      return;
    }
    const inUse = deletingAssets.find((item) => Number(item.usage_count || 0) > 0);
    if (inUse) {
      setMessage(`${inUse.title} is still referenced by the Content Calendar. Remove that reference or archive it instead.`);
      return;
    }

    const linkedCount = Math.max(0, deleteIds.length - 1);
    const linkedCopy = linkedCount ? ` This also deletes ${linkedCount} linked asset${linkedCount === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`Delete “${asset.title}” permanently?${linkedCopy} Stored files and version history will be removed. This cannot be undone.`)) return;
    if (deleteInFlightRef.current.has(asset.id)) return;

    deleteInFlightRef.current.add(asset.id);
    setBusy(`delete:${asset.id}`);
    try {
      const response = await fetch("/api/admin/pathway-assets/delete", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: asset.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Asset could not be deleted.");
      const deletedIds = new Set<string>(
        Array.isArray(data.deletedIds)
          ? data.deletedIds.filter((id: unknown): id is string => typeof id === "string")
          : [asset.id]
      );
      setAssets((current) => current.filter((item) => !deletedIds.has(item.id)));
      setSelectedIds((current) => new Set(Array.from(current).filter((id) => !deletedIds.has(id))));
      if (inspectId && deletedIds.has(inspectId)) setInspectId(null);
      setMessage(`Deleted ${asset.title} permanently${deletedIds.size > 1 ? ` with ${deletedIds.size - 1} linked asset${deletedIds.size === 2 ? "" : "s"}` : ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset could not be deleted.");
    } finally {
      deleteInFlightRef.current.delete(asset.id);
      setBusy(null);
    }
  }

  async function uploadManual(files: File[]) {
    if (!files.length) return;
    setBusy("upload");
    setMessage(`Uploading ${files.length} image${files.length === 1 ? "" : "s"} to ${pathwayTitle} → ${studio === "carousel" ? "Carousel Studio" : "Video Studio"}…`);
    let saved = 0;
    let duplicates = 0;
    const errors: string[] = [];
    try {
      for (const file of files) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
          errors.push(`${file.name}: unsupported file type`);
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          errors.push(`${file.name}: larger than 8 MB`);
          continue;
        }
        try {
          const dataUrl = await fileToDataUrl(file);
          const response = await fetch("/api/admin/pathway-assets/upload", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              pathwaySlug,
              studio,
              assetType: "uploaded-image",
              title: file.name.replace(/\.[^.]+$/, ""),
              dataUrl,
              sourceType: "uploaded",
              metadata: { originalFilename: file.name, favorite: false, tags: [] }
            })
          });
          const data = await response.json().catch(() => ({}));
          if (response.status === 409 && data.duplicateAssetId) {
            duplicates += 1;
            continue;
          }
          if (!response.ok) throw new Error(data.error || "Upload failed.");
          saved += 1;
        } catch (error) {
          errors.push(`${file.name}: ${error instanceof Error ? error.message : "upload failed"}`);
        }
      }
      const parts = [`${saved} saved`];
      if (duplicates) parts.push(`${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped`);
      if (errors.length) parts.push(`${errors.length} failed`);
      setMessage(`${parts.join(" · ")}. ${errors.length ? errors.slice(0, 2).join(" | ") : "Everything is attached to this Pathway."}`);
      await refresh();
    } finally {
      setBusy(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function generateImage() {
    if (!aiReady || imagePrompt.trim().length < 3) return;
    setBusy("generate");
    setMessage("Sol is directing the image from your saved Apostolic Guide style…");
    try {
      const orientation = imageType === "thumbnail" ? "landscape" : "portrait";
      const response = await fetch("/api/admin/pathway-assets/generate-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, creationType: imageType, visualStyle: "editorial", prompt: imagePrompt, orientation, quality: "low" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Image generation failed.");
      setGenerated(data as GeneratedImage);
      setMessage(`Image ready${Number(data.referenceCount || 0) ? ` · ${data.referenceCount} saved style reference${Number(data.referenceCount) === 1 ? "" : "s"} used` : ""}. Save it to keep it in this Pathway folder.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image generation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveGenerated() {
    if (!generated) return;
    setBusy("save-image");
    try {
      const assetType = imageType === "thumbnail" ? "thumbnail" : "generated-image";
      const response = await fetch("/api/admin/pathway-assets/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathwaySlug,
          studio,
          assetType,
          title: `${pathwayTitle} ${imageType}`,
          dataUrl: generated.dataUrl,
          sourceType: "generated",
          prompt: generated.prompt,
          model: generated.imageModel,
          metadata: { solModel: generated.solModel, size: generated.size, creationType: imageType, favorite: false, tags: [] }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Generated image could not be saved.");
      setGenerated(null);
      setMessage("Saved to the Pathway folder.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Generated image could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function setStyleReference(asset: PathwayAsset, enabled = !asset.is_style_reference) {
    setBusy(`style:${asset.id}`);
    try {
      const response = await fetch("/api/admin/pathway-assets/style-reference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, enabled })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Style reference could not be saved.");
      const ids = new Set(Array.isArray(data.referenceAssetIds) ? data.referenceAssetIds : []);
      setAssets((current) => current.map((item) => ({ ...item, is_style_reference: ids.has(item.id) })));
      setMessage(enabled ? `${asset.title} is now teaching Sol the Apostolic Guide visual language.` : `${asset.title} was removed from Sol’s style reference set.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Style reference could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function enrichAsset(asset: PathwayAsset) {
    if (!aiReady || !asset.preview_url) return;
    setBusy(`enrich:${asset.id}`);
    setEnrichment(null);
    try {
      const response = await fetch("/api/admin/pathway-assets/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId: asset.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Sol could not analyze this asset.");
      setEnrichment(data.enrichment as AssetEnrichment);
      setMessage("Sol prepared metadata suggestions. Review them before applying anything.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sol could not analyze this asset.");
    } finally {
      setBusy(null);
    }
  }

  function applyEnrichment() {
    if (!enrichment) return;
    setDetailTitle(enrichment.suggestedTitle);
    setDetailDescription(enrichment.description);
    setDetailAltText(enrichment.altText);
    setDetailTags(enrichment.tags.join(", "));
    setMessage("Sol’s suggestions are in the editor. Review them, then save when they are right.");
    setEnrichment(null);
  }

  async function saveDetails(asset: PathwayAsset) {
    await patchAsset(asset, {
      title: detailTitle,
      description: detailDescription,
      altText: detailAltText,
      tags: parseAssetTagInput(detailTags),
      status: detailStatus
    }, "Asset details saved. Search, filters, and downstream work can use this metadata now.");
  }

  async function queueInCalendar(asset: PathwayAsset) {
    const contentType = calendarType(asset);
    if (!contentType) return;
    setBusy(`calendar:${asset.id}`);
    try {
      const response = await fetch("/api/admin/content-calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pathwaySlug: asset.pathway_slug,
          title: asset.title,
          contentType,
          platform: asset.studio === "video" ? "youtube" : "instagram",
          status: "draft",
          source: "pathway-assets",
          sourceRef: asset.id,
          assetId: asset.id,
          metadata: { studio: asset.studio, assetType: asset.asset_type, version: asset.version }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not add this asset to the calendar.");
      setMessage(`${asset.title} is in the Content Calendar as a draft. Pick its day there when you are ready.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this asset to the calendar.");
    } finally {
      setBusy(null);
    }
  }

  async function loadAssetFile(asset: PathwayAsset) {
    const response = await fetch(`/api/admin/pathway-assets/download?id=${encodeURIComponent(asset.id)}`, { cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Asset download failed.");
    }
    const blob = await response.blob();
    const filename = filenameFromDisposition(response.headers.get("content-disposition"), `${asset.title.replace(/\s+/g, "-")}.bin`);
    return { blob, filename };
  }

  async function downloadAsset(asset: PathwayAsset) {
    setBusy(`download:${asset.id}`);
    try {
      const { blob, filename } = await loadAssetFile(asset);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setMessage(`${asset.title} downloaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Asset download failed.");
    } finally {
      setBusy(null);
    }
  }

  async function shareAsset(asset: PathwayAsset) {
    setBusy(`share:${asset.id}`);
    try {
      const { blob, filename } = await loadAssetFile(asset);
      const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
      if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await navigator.share({ title: asset.title, files: [file] });
        setMessage(`${asset.title} opened in the device share sheet.`);
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        setMessage("Device sharing is unavailable here, so the asset was downloaded instead.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage("Share cancelled.");
      else setMessage(error instanceof Error ? error.message : "Asset could not be shared.");
    } finally {
      setBusy(null);
    }
  }

  function applySavedView(viewId: string) {
    setActiveViewId(viewId);
    if (!viewId) return;
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;
    const filters = normalizeSavedFilters(view.filters);
    setQuery(filters.query);
    setStudioScope(filters.studioScope);
    setFilter(filters.group);
    setStatusFilter(filters.status);
    setFavoritesOnly(filters.favoritesOnly);
    setSort(filters.sort);
    setMessage(`Applied smart view “${view.name}”. It will stay current as this Pathway library changes.`);
  }

  async function saveCurrentView() {
    const name = viewName.trim();
    if (!name) return;
    setBusy("save-view");
    try {
      const response = await fetch("/api/admin/pathway-assets/views", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pathwaySlug, name, filters: currentFilters() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Smart view could not be saved.");
      setViewName("");
      setShowSaveView(false);
      await refreshViews();
      setActiveViewId(String(data.view?.id || ""));
      setMessage(`Saved smart view “${name}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Smart view could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteActiveView() {
    if (!activeViewId) return;
    const view = savedViews.find((item) => item.id === activeViewId);
    if (!view || !window.confirm(`Delete smart view “${view.name}”? The assets will not be changed.`)) return;
    setBusy("delete-view");
    try {
      const response = await fetch("/api/admin/pathway-assets/views", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: activeViewId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Smart view could not be deleted.");
      setActiveViewId("");
      await refreshViews();
      setMessage(`Deleted smart view “${view.name}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Smart view could not be deleted.");
    } finally {
      setBusy(null);
    }
  }

  function toggleAssetSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const asset of visible) next.add(asset.id);
      return next;
    });
  }

  async function bulkUpdate(patch: { status?: Exclude<AssetStatus, "archived">; favorite?: boolean; addTags?: string[]; archive?: boolean }, label: string) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (patch.archive && !window.confirm(`Archive ${ids.length} selected asset${ids.length === 1 ? "" : "s"}? Files and history remain preserved.`)) return;
    setBusy("bulk");
    try {
      const response = await fetch("/api/admin/pathway-assets/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids, ...patch })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Selected assets could not be updated.");
      if (patch.archive) setSelectedIds(new Set());
      if (patch.addTags) setBulkTags("");
      setMessage(`${label}: ${Number(data.count || ids.length)} asset${Number(data.count || ids.length) === 1 ? "" : "s"} updated.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Selected assets could not be updated.");
    } finally {
      setBusy(null);
    }
  }

  return <section className="admin-card pathway-asset-library">
    <div className="pathway-assets-head">
      <div className="pathway-folder-title"><FolderOpen size={22}/><div><span className="section-kicker">Pathway source of truth</span><h2>{pathwayTitle}</h2><p>/{pathwaySlug}/ · {assets.length} active assets · {parentCount} projects · {favoriteCount} favorites · {inUseCount} in use</p></div></div>
      <div className="pathway-assets-actions">
        <input ref={uploadRef} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void uploadManual(files); }}/>
        <button type="button" className="button" disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()}><Upload size={15}/> Upload images</button>
        <button type="button" className="button" disabled={busy === "load"} onClick={() => void refresh()}>{busy === "load" ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>} Refresh</button>
      </div>
    </div>

    <button type="button" className="pathway-assets-dropzone" disabled={Boolean(busy)} onClick={() => uploadRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const files = Array.from(event.dataTransfer.files ?? []); if (files.length) void uploadManual(files); }}>
      <Upload size={18}/><span><strong>Drop PNG, JPEG, or WebP files here</strong><small>Multi-upload · 8 MB max each · exact duplicates are skipped automatically · destination: {studio === "carousel" ? "Carousel + Social" : "Video"}</small></span>
    </button>

    <div className="pathway-folder-lanes" aria-label="Pathway asset lanes">
      <button type="button" className={studioScope === "all" ? "is-active" : ""} onClick={() => { clearActiveView(); setStudioScope("all"); }}><strong>All Pathway</strong><span>{assets.length}</span></button>
      <button type="button" className={studioScope === "carousel" ? "is-active" : ""} onClick={() => { clearActiveView(); setStudioScope("carousel"); }}><strong>Carousel + Social</strong><span>{carouselCount}</span></button>
      <button type="button" className={studioScope === "video" ? "is-active" : ""} onClick={() => { clearActiveView(); setStudioScope("video"); }}><strong>Video</strong><span>{videoCount}</span></button>
    </div>

    {message ? <div className="pathway-assets-message">{message}</div> : null}

    <div className="pathway-image-workbench">
      <div><span className="section-kicker">Sol image desk</span><h3>Create a reusable visual</h3><p>Sol directs the image from the saved brand profile and images you marked as style references. Text stays outside the generated image so the graphic layer can be reused and the layout stays editable.</p></div>
      <div className="pathway-image-controls">
        <select value={imageType} onChange={(event) => setImageType(event.target.value as typeof imageType)}>
          {studio === "carousel" ? <><option value="single-post">Single post visual</option><option value="story">Story visual</option><option value="thumbnail">Thumbnail</option><option value="background">Carousel background</option></> : <><option value="thumbnail">Video thumbnail</option><option value="background">Video visual</option></>}
        </select>
        <textarea rows={3} value={imagePrompt} onChange={(event) => setImagePrompt(event.target.value)} placeholder="Example: A restrained documentary image suggesting revelation and identity, strong negative space for type…"/>
        <button type="button" className="button primary" disabled={!aiReady || Boolean(busy) || imagePrompt.trim().length < 3} onClick={() => void generateImage()}>{busy === "generate" ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Generate with Sol</button>
      </div>
      {generated ? <div className="pathway-generated-preview"><img src={generated.dataUrl} alt="Generated Apostolic Guide visual preview"/><div><strong>Generated visual</strong><span>{generated.imageModel}</span><button type="button" className="button primary" disabled={Boolean(busy)} onClick={() => void saveGenerated()}>{busy === "save-image" ? <Loader2 className="spin" size={15}/> : <FolderOpen size={15}/>} Save to Pathway</button></div></div> : null}
    </div>

    <div className="pathway-assets-smartviews">
      <div><Bookmark size={16}/><select value={activeViewId} aria-label="Smart view" onChange={(event) => applySavedView(event.target.value)}><option value="">Smart views</option>{savedViews.map((view) => <option value={view.id} key={view.id}>{view.name}</option>)}</select></div>
      <button type="button" className="button" onClick={() => setShowSaveView((value) => !value)}><Save size={14}/> Save current view</button>
      {activeViewId ? <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void deleteActiveView()}><Trash2 size={14}/> Delete view</button> : null}
      <span>Saved views are live searches, not duplicate folders.</span>
    </div>
    {showSaveView ? <div className="pathway-assets-save-view"><input value={viewName} maxLength={80} onChange={(event) => setViewName(event.target.value)} placeholder="Example: Approved Jesus visuals"/><button type="button" className="button primary" disabled={busy === "save-view" || !viewName.trim()} onClick={() => void saveCurrentView()}>{busy === "save-view" ? <Loader2 className="spin" size={14}/> : <Check size={14}/>} Save smart view</button><button type="button" className="button" onClick={() => { setShowSaveView(false); setViewName(""); }}>Cancel</button></div> : null}

    <div className="pathway-assets-toolbar">
      <label className="pathway-assets-search"><Search size={16}/><input value={query} onChange={(event) => { clearActiveView(); setQuery(event.target.value); }} placeholder="Search title, tag, description, type…"/></label>
      <select aria-label="Filter by status" value={statusFilter} onChange={(event) => { clearActiveView(); setStatusFilter(event.target.value as StatusFilter); }}><option value="all">All statuses</option>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{status}</option>)}</select>
      <select aria-label="Sort assets" value={sort} onChange={(event) => { clearActiveView(); setSort(event.target.value as SortKey); }}><option value="updated">Recently updated</option><option value="title">Title A–Z</option><option value="status">Workflow status</option></select>
      <button type="button" className={favoritesOnly ? "is-active" : ""} onClick={() => { clearActiveView(); setFavoritesOnly((value) => !value); }}><Star size={15} fill={favoritesOnly ? "currentColor" : "none"}/> Favorites {favoriteCount ? `(${favoriteCount})` : ""}</button>
    </div>

    <div className="pathway-assets-filter">
      {(["all","visual","copy","output"] as const).map((key) => <button type="button" key={key} className={filter === key ? "is-active" : ""} onClick={() => { clearActiveView(); setFilter(key); }}>{key === "all" ? "All assets" : key === "visual" ? "Visuals" : key === "copy" ? "Copy" : "Projects + outputs"}</button>)}
      <span className="pathway-assets-result-count">{visible.length} shown</span>
    </div>

    {selectedIds.size ? <div className="pathway-assets-bulkbar">
      <strong>{selectedIds.size} selected</strong>
      <button type="button" onClick={selectAllVisible}>Select all shown {selectedVisibleCount === visible.length && visible.length ? "✓" : ""}</button>
      <button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button>
      <div><select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as Exclude<AssetStatus, "archived">)}>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{status}</option>)}</select><button type="button" disabled={busy === "bulk"} onClick={() => void bulkUpdate({ status: bulkStatus }, "Status changed")}>Set status</button></div>
      <div className="pathway-assets-bulk-tags"><input value={bulkTags} onChange={(event) => setBulkTags(event.target.value)} placeholder="Add tags…"/><button type="button" disabled={busy === "bulk" || !parseAssetTagInput(bulkTags).length} onClick={() => void bulkUpdate({ addTags: parseAssetTagInput(bulkTags) }, "Tags added")}><Tags size={13}/> Add</button></div>
      <button type="button" disabled={busy === "bulk"} onClick={() => void bulkUpdate({ favorite: true }, "Favorited")}><Star size={13}/> Favorite</button>
      <button type="button" className="is-danger" disabled={busy === "bulk"} onClick={() => void bulkUpdate({ archive: true }, "Archived")}><Archive size={13}/> Archive</button>
    </div> : null}

    {selectedAsset ? <div className="pathway-asset-inspector">
      <div className="pathway-asset-inspector-preview">{selectedAsset.preview_url ? <img src={selectedAsset.preview_url} alt={assetAltText(selectedAsset.metadata) || ""}/> : <ImageIcon size={30}/>}</div>
      <div className="pathway-asset-inspector-body">
        <div className="pathway-asset-inspector-head"><div><span className="section-kicker">Asset details</span><h3>{selectedAsset.title}</h3><p>{selectedAsset.studio} · {selectedAsset.asset_type.replaceAll("-", " ")} · version {selectedAsset.version} · {selectedAsset.source_type}</p></div><button type="button" aria-label="Close asset details" onClick={() => setInspectId(null)}><X size={18}/></button></div>
        <div className="pathway-asset-inspector-form">
          <label><span>Title</span><input value={detailTitle} maxLength={180} onChange={(event) => setDetailTitle(event.target.value)}/></label>
          <label><span>Status</span><select value={detailStatus} onChange={(event) => setDetailStatus(event.target.value as AssetStatus)}>{STATUS_OPTIONS.map((status) => <option value={status} key={status}>{status}</option>)}</select></label>
          <label className="is-wide"><span>Description</span><textarea rows={3} maxLength={1200} value={detailDescription} onChange={(event) => setDetailDescription(event.target.value)} placeholder="What is this asset for?"/></label>
          <label className="is-wide"><span>Alt text</span><textarea rows={2} maxLength={500} value={detailAltText} onChange={(event) => setDetailAltText(event.target.value)} placeholder="Describe the visual for accessibility and reuse."/></label>
          <label className="is-wide"><span>Tags</span><input value={detailTags} onChange={(event) => setDetailTags(event.target.value)} placeholder="Jesus, deity, John 1, cover"/><small>Comma-separated. Search uses these.</small></label>
        </div>

        {aiReady && selectedAsset.preview_url ? <div className="pathway-asset-enrichment">
          <div><WandSparkles size={16}/><div><strong>Sol metadata assist</strong><span>Visual analysis + Pathway context. Suggestions never auto-publish.</span></div></div>
          {!enrichment ? <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void enrichAsset(selectedAsset)}>{busy === `enrich:${selectedAsset.id}` ? <Loader2 className="spin" size={14}/> : <Sparkles size={14}/>} Suggest title, description, alt text + tags</button> : <div className="pathway-asset-enrichment-result"><div><span>Suggested title</span><strong>{enrichment.suggestedTitle}</strong></div><div><span>Description</span><p>{enrichment.description}</p></div><div><span>Alt text</span><p>{enrichment.altText}</p></div><div><span>Tags</span><p>{enrichment.tags.join(" · ")}</p></div><small>{Math.round(enrichment.confidence * 100)}% model confidence · human review required</small><div><button type="button" className="button primary" onClick={applyEnrichment}><Check size={14}/> Apply to fields</button><button type="button" className="button" onClick={() => setEnrichment(null)}>Discard</button></div></div>}
        </div> : null}

        <div className="pathway-asset-usage">
          <div><span className="section-kicker">Usage + relationships</span><strong>{Number(selectedAsset.usage_count || 0)} calendar reference{Number(selectedAsset.usage_count || 0) === 1 ? "" : "s"}</strong>{selectedAsset.latest_usage ? <p>Latest: {selectedAsset.latest_usage.platform || "unassigned"} · {selectedAsset.latest_usage.status || "draft"}{selectedAsset.latest_usage.scheduled_for ? ` · ${new Date(selectedAsset.latest_usage.scheduled_for).toLocaleString()}` : ""}</p> : <p>Not queued for distribution yet.</p>}</div>
          <div><strong>{selectedParent ? "1 parent asset" : "No parent"} · {selectedChildren.length} child asset{selectedChildren.length === 1 ? "" : "s"}</strong>{selectedParent ? <button type="button" onClick={() => setInspectId(selectedParent.id)}>Open parent: {selectedParent.title}</button> : null}{selectedChildren.slice(0, 4).map((child) => <button type="button" key={child.id} onClick={() => setInspectId(child.id)}>Open child: {child.title}</button>)}</div>
          {Number(selectedAsset.usage_count || 0) > 0 ? <a className="button" href="/admin/content-calendar"><CalendarPlus size={14}/> Open Content Calendar</a> : null}
        </div>

        <div className="pathway-asset-technical">
          {typeof selectedAsset.metadata?.mime === "string" ? <span>{String(selectedAsset.metadata.mime)}</span> : null}
          {humanBytes(selectedAsset.metadata?.bytes) ? <span>{humanBytes(selectedAsset.metadata?.bytes)}</span> : null}
          {typeof selectedAsset.metadata?.sha256 === "string" ? <span>SHA {String(selectedAsset.metadata.sha256).slice(0, 10)}…</span> : null}
          {selectedAsset.model ? <span>{selectedAsset.model}</span> : null}
        </div>
        <div className="pathway-asset-inspector-actions">
          <button type="button" className="button primary" disabled={Boolean(busy) || !detailTitle.trim()} onClick={() => void saveDetails(selectedAsset)}>{busy === `patch:${selectedAsset.id}` ? <Loader2 className="spin" size={15}/> : null} Save details</button>
          <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void patchAsset(selectedAsset, { favorite: !assetIsFavorite(selectedAsset.metadata) }, assetIsFavorite(selectedAsset.metadata) ? "Removed from favorites." : "Added to favorites.")}><Star size={15} fill={assetIsFavorite(selectedAsset.metadata) ? "currentColor" : "none"}/> {assetIsFavorite(selectedAsset.metadata) ? "Favorited" : "Favorite"}</button>
          {selectedAsset.preview_url ? <button type="button" className={`button ${selectedAsset.is_style_reference ? "is-active" : ""}`} disabled={Boolean(busy)} onClick={() => void setStyleReference(selectedAsset)}><Sparkles size={15}/> {selectedAsset.is_style_reference ? "Style reference" : "Teach Sol style"}</button> : null}
          <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => void patchAsset(selectedAsset, { archive: true }, "Asset archived. Its file and history remain preserved.")}><Archive size={15}/> Archive</button>
          <button type="button" className="button danger" disabled={Boolean(busy)} onClick={() => void deleteAsset(selectedAsset)}>{busy === `delete:${selectedAsset.id}` ? <Loader2 className="spin" size={15}/> : <Trash2 size={15}/>} Delete</button>
        </div>
      </div>
    </div> : null}

    {visible.length ? <div className="pathway-assets-grid">{visible.map((asset) => {
      const canCalendar = !asset.parent_asset_id && Boolean(calendarType(asset));
      const tags = assetTags(asset.metadata);
      const selected = selectedIds.has(asset.id);
      return <article className={`pathway-asset-card ${inspectId === asset.id ? "is-inspected" : ""} ${selected ? "is-selected" : ""}`} key={asset.id}>
        <button type="button" className={`pathway-asset-select ${selected ? "is-selected" : ""}`} aria-label={selected ? `Deselect ${asset.title}` : `Select ${asset.title}`} onClick={() => toggleAssetSelection(asset.id)}>{selected ? <Check size={13}/> : null}</button>
        {asset.preview_url ? <button type="button" className="pathway-asset-preview" onClick={() => setInspectId(asset.id)}><img src={asset.preview_url} alt={assetAltText(asset.metadata) || ""}/>{assetIsFavorite(asset.metadata) ? <span className="pathway-asset-favorite-badge"><Star size={13} fill="currentColor"/></span> : null}</button> : <button type="button" className="pathway-asset-preview is-empty" onClick={() => setInspectId(asset.id)}><ImageIcon size={22}/></button>}
        <div className="pathway-asset-copy"><span>{asset.studio} · {asset.asset_type.replaceAll("-", " ")} · v{asset.version}</span><strong>{asset.title}</strong><small>{asset.status} · {asset.source_type} · {new Date(asset.updated_at).toLocaleString()}</small>{assetDescription(asset.metadata) ? <p>{assetDescription(asset.metadata)}</p> : null}{tags.length ? <div className="pathway-asset-tags">{tags.slice(0, 4).map((tag) => <i key={tag}>{tag}</i>)}{tags.length > 4 ? <i>+{tags.length - 4}</i> : null}</div> : null}{Number(asset.usage_count || 0) > 0 ? <div className="pathway-asset-use-badge"><Layers3 size={12}/> Used {asset.usage_count}× · {asset.latest_usage?.platform || "calendar"}</div> : null}</div>
        <div className="pathway-asset-actions">
          <button type="button" onClick={() => setInspectId(asset.id)}><Info size={14}/> Details</button>
          {asset.editable && onOpenAsset ? <button type="button" onClick={() => onOpenAsset(asset)}><Pencil size={14}/> Edit</button> : null}
          {canCalendar ? <button type="button" disabled={Boolean(busy)} onClick={() => void queueInCalendar(asset)}>{busy === `calendar:${asset.id}` ? <Loader2 className="spin" size={14}/> : <CalendarPlus size={14}/>} Calendar</button> : null}
          {(asset.storage_path || asset.public_url) ? <button type="button" disabled={Boolean(busy)} onClick={() => void downloadAsset(asset)}>{busy === `download:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Download size={14}/>} Download</button> : null}
          {(asset.storage_path || asset.public_url) ? <button type="button" disabled={Boolean(busy)} onClick={() => void shareAsset(asset)}>{busy === `share:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Share2 size={14}/>} Share</button> : null}
          {asset.preview_url ? <button type="button" className={asset.is_style_reference ? "is-active" : ""} disabled={busy === `style:${asset.id}`} onClick={() => void setStyleReference(asset)}>{busy === `style:${asset.id}` ? <Loader2 className="spin" size={14}/> : <Sparkles size={14}/>} {asset.is_style_reference ? "Style ref" : "Teach style"}</button> : null}
        </div>
      </article>;
    })}</div> : <div className="studio-empty-state compact"><FolderOpen size={26}/><strong>No assets match this view</strong><p>{assets.length ? "Clear the search or filters to see the rest of this Pathway library." : "Generate, save, or upload the first asset. Every future output will stay attached to this Pathway."}</p></div>}
  </section>;
}