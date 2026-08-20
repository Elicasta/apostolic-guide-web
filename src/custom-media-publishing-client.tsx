"use client";

import { upload } from "@vercel/blob/client";
import { CalendarDays, CheckCircle2, Film, Image as ImageIcon, Instagram, Loader2, Save, Send, ShieldCheck, Sparkles, UploadCloud, Youtube } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { allPathways } from "@/pathway-catalog";
import { isSupportedPathwayAssetMime, PATHWAY_ASSET_MAX_UPLOAD_BYTES, pathwayAssetClientFingerprint, pathwayAssetMediaKind, sanitizePathwayAssetFilename } from "@/pathway-asset-ingest";

type Platform = "instagram" | "youtube";
type MediaFormat = "image" | "reel" | "long_form";
type PublishMode = "publish_now" | "schedule";
type RecentAsset = { id: string; pathway_slug: string; title: string; status: string; public_url?: string | null; metadata?: Record<string, unknown> | null; updated_at?: string };
type TheologyIssue = { severity: "warning" | "block"; claim: string; reason: string; scripture: string[] };
type TheologyReview = { status: "pass" | "warning" | "block"; summary: string; issues: TheologyIssue[] };
type FormState = {
  assetId: string;
  pathwaySlug: string;
  platform: Platform;
  mediaFormat: MediaFormat;
  title: string;
  brief: string;
  description: string;
  caption: string;
  altText: string;
  hashtags: string;
  tags: string;
  internalTags: string;
  privacyStatus: "private" | "unlisted" | "public";
};

const pathways = allPathways.map(({ slug, title, collection, summary }) => ({ slug, title, collection, summary }));
const defaultPathway = pathways[0]?.slug || "god-is-one";
const emptyForm: FormState = {
  assetId: "",
  pathwaySlug: defaultPathway,
  platform: "instagram",
  mediaFormat: "image",
  title: "",
  brief: "",
  description: "",
  caption: "",
  altText: "",
  hashtags: "",
  tags: "",
  internalTags: "",
  privacyStatus: "private"
};
const theologySensitiveFields = new Set<keyof FormState>(["pathwaySlug", "title", "brief", "description", "caption"]);

function list(value: string) {
  return [...new Set(value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean))];
}

function join(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

function withoutEmDash(value: string) {
  return value.replace(/\s*—\s*/g, ", ");
}

function localInputValue(date = new Date(Date.now() + 60 * 60_000)) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store", headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

async function ingestAction(body: Record<string, unknown>) {
  return jsonRequest<Record<string, unknown>>("/api/admin/pathway-assets/ingest", { method: "POST", body: JSON.stringify(body) });
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : "";
}

export function CustomMediaPublishingClient() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [recent, setRecent] = useState<RecentAsset[]>([]);
  const [working, setWorking] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState("Upload finished media, then let Sol prep the post or fill the metadata yourself.");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PublishMode>("publish_now");
  const [scheduledFor, setScheduledFor] = useState(localInputValue());
  const [theologyReview, setTheologyReview] = useState<TheologyReview | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedPathway = useMemo(() => pathways.find((pathway) => pathway.slug === form.pathwaySlug) ?? pathways[0], [form.pathwaySlug]);
  const kind = pathwayAssetMediaKind(mimeType);
  const isImage = kind === "image";
  const isVideo = kind === "video";
  const canYouTube = isVideo;
  const canPublish = Boolean(form.assetId && form.title.trim() && (form.platform === "instagram" ? form.caption.trim() || form.description.trim() : form.description.trim()));

  useEffect(() => () => { if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  async function loadRecent() {
    try {
      const data = await jsonRequest<{ assets: RecentAsset[] }>("/api/admin/publishing/custom-media");
      setRecent(data.assets || []);
    } catch {
      // The primary workflow remains usable when history cannot load.
    }
  }

  useEffect(() => { void loadRecent(); }, []);

  function patch(values: Partial<FormState>) {
    if ((Object.keys(values) as (keyof FormState)[]).some((key) => theologySensitiveFields.has(key))) setTheologyReview(null);
    setForm((current) => ({ ...current, ...values }));
  }

  function resetForFile(nextFile: File) {
    const nextKind = pathwayAssetMediaKind(nextFile.type);
    setFile(nextFile);
    setMimeType(nextFile.type);
    setTheologyReview(null);
    setPreviewUrl((current) => {
      if (current.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
    setUploadProgress(0);
    setForm((current) => ({
      ...emptyForm,
      pathwaySlug: current.pathwaySlug,
      platform: nextKind === "image" ? "instagram" : current.platform,
      mediaFormat: nextKind === "image" ? "image" : "reel",
      title: nextFile.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim()
    }));
  }

  function chooseFile(nextFile: File | null) {
    setError("");
    if (!nextFile) return;
    if (!isSupportedPathwayAssetMime(nextFile.type) || !["image", "video"].includes(pathwayAssetMediaKind(nextFile.type) || "")) return setError("Choose a supported image or video file.");
    if (nextFile.size > PATHWAY_ASSET_MAX_UPLOAD_BYTES) return setError("That file is over the 20 GB source-media limit.");
    resetForFile(nextFile);
  }

  async function uploadFile() {
    if (!file || working) return;
    setWorking("upload");
    setError("");
    setMessage("Preparing private media upload...");
    try {
      const requestedStudio = pathwayAssetMediaKind(file.type) === "video" ? "video" : "carousel";
      const prepared = await ingestAction({
        action: "prepare",
        pathwaySlug: form.pathwaySlug,
        studio: requestedStudio,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        lastModified: file.lastModified,
        clientFingerprint: pathwayAssetClientFingerprint({ name: file.name, size: file.size, lastModified: file.lastModified, mimeType: file.type }),
        mediaMetadata: {}
      });
      const session = prepared.session && typeof prepared.session === "object" ? prepared.session as Record<string, unknown> : {};
      const sessionId = String(session.id || "");
      const pathname = String(prepared.pathname || session.storage_path || "");
      if (!sessionId || !pathname) throw new Error("Upload destination was not prepared.");
      await upload(pathname || sanitizePathwayAssetFilename(file.name), file, {
        access: "private",
        handleUploadUrl: "/api/admin/pathway-assets/ingest-upload",
        clientPayload: JSON.stringify({ sessionId }),
        contentType: file.type,
        multipart: true,
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.max(0, Math.min(100, percentage)))
      });
      await ingestAction({ action: "progress", sessionId, bytesUploaded: file.size }).catch(() => undefined);
      const finalized = await ingestAction({ action: "finalize", sessionId });
      const assetId = String(finalized.assetId || (finalized.asset && typeof finalized.asset === "object" ? (finalized.asset as Record<string, unknown>).id : "") || "");
      if (!assetId) throw new Error("Upload finished but the asset was not registered.");
      patch({ assetId });
      setUploadProgress(100);
      setMessage("Upload complete. Add a brief, generate with Sol, then review every field before publishing.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setWorking("");
    }
  }

  function payload(action: "generate" | "check_theology" | "save" | "publish") {
    return {
      action,
      assetId: form.assetId,
      pathwaySlug: form.pathwaySlug,
      platform: form.platform,
      mediaFormat: form.mediaFormat,
      title: form.title,
      brief: form.brief,
      description: form.description,
      caption: form.caption,
      altText: form.altText,
      hashtags: list(form.hashtags),
      tags: list(form.tags),
      internalTags: list(form.internalTags),
      privacyStatus: form.privacyStatus
    };
  }

  async function generate() {
    if (!form.assetId || working) return;
    setWorking("sol");
    setError("");
    setMessage("Sol is preparing platform metadata from your brief and selected Pathway...");
    try {
      const data = await jsonRequest<{ generated: Record<string, unknown> }>("/api/admin/publishing/custom-media/sol", { method: "POST", body: JSON.stringify(payload("generate")) });
      const generated = data.generated || {};
      patch({
        title: typeof generated.title === "string" ? withoutEmDash(generated.title) : form.title,
        description: typeof generated.description === "string" ? withoutEmDash(generated.description) : form.description,
        caption: typeof generated.caption === "string" ? withoutEmDash(generated.caption) : form.caption,
        altText: typeof generated.altText === "string" ? withoutEmDash(generated.altText) : form.altText,
        hashtags: join(generated.hashtags),
        tags: join(generated.tags),
        internalTags: join(generated.internalTags)
      });
      setMessage("Sol draft ready. Edit anything you want, then run the theology check.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sol generation failed. You can continue manually.");
    } finally { setWorking(""); }
  }

  async function checkTheology() {
    if (!form.assetId || working) return;
    setWorking("theology");
    setError("");
    setMessage("Checking this copy against the selected Pathway and supplied Scripture...");
    try {
      const data = await jsonRequest<{ review: TheologyReview }>("/api/admin/publishing/custom-media/sol", { method: "POST", body: JSON.stringify(payload("check_theology")) });
      setTheologyReview(data.review);
      setMessage(data.review.status === "pass" ? "Theology check passed." : "Theology check finished. Review the notes before publishing.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Theology check failed.");
    } finally { setWorking(""); }
  }

  async function saveDraft() {
    if (!form.assetId || working) return;
    setWorking("save");
    setError("");
    try {
      const data = await jsonRequest<{ message?: string }>("/api/admin/publishing/custom-media", { method: "POST", body: JSON.stringify(payload("save")) });
      setMessage(data.message || "Draft saved.");
      await loadRecent();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Draft could not be saved."); }
    finally { setWorking(""); }
  }

  async function publish() {
    if (!canPublish || working) return;
    setWorking("publish");
    setError("");
    try {
      const body: Record<string, unknown> = { ...payload("publish"), mode };
      if (mode === "schedule") body.scheduledFor = new Date(scheduledFor).toISOString();
      const data = await jsonRequest<{ message?: string }>("/api/admin/publishing/custom-media", { method: "POST", body: JSON.stringify(body) });
      setMessage(data.message || (mode === "schedule" ? "Scheduled." : "Published."));
      await loadRecent();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Publication failed."); }
    finally { setWorking(""); }
  }

  function loadAsset(asset: RecentAsset) {
    const metadata = asset.metadata || {};
    const mime = metadataString(metadata, "mimeType") || metadataString(metadata, "mime");
    const media = pathwayAssetMediaKind(mime);
    const platform = metadataString(metadata, "preferredPlatform") === "youtube" ? "youtube" : "instagram";
    const formatRaw = metadataString(metadata, "mediaFormat");
    const format: MediaFormat = ["image", "reel", "long_form"].includes(formatRaw) ? formatRaw as MediaFormat : media === "image" ? "image" : "reel";
    setFile(null);
    setMimeType(mime);
    setTheologyReview(null);
    setPreviewUrl(asset.public_url || `/api/admin/pathway-assets/file?id=${encodeURIComponent(asset.id)}`);
    setForm({
      assetId: asset.id,
      pathwaySlug: asset.pathway_slug,
      platform,
      mediaFormat: format,
      title: asset.title,
      brief: metadataString(metadata, "customBrief"),
      description: metadataString(metadata, "publishingDescription"),
      caption: metadataString(metadata, "publishingCaption"),
      altText: metadataString(metadata, "publishingAltText"),
      hashtags: join(metadata.publishingHashtags),
      tags: join(metadata.publishingTags),
      internalTags: join(metadata.internalTags),
      privacyStatus: "private"
    });
    setMessage("Custom media reopened. Review the metadata and publish when ready.");
    setError("");
  }

  return <section className="creative-publishing-shell creative-guided-publishing custom-media-publisher">
    <div className="creative-page-head">
      <div><span className="creative-kicker">Distribution · Custom Media</span><h1>Upload it. Package it. Publish it.</h1><p>Bring finished graphics, reels, Shorts, or long-form video into one outbound workflow. The source stays in Pathway Assets, the post stays tied to a Pathway, and scheduled work lands on the Publishing calendar.</p></div>
      <div className="master-publishing-mark"><UploadCloud size={18}/><strong>Custom</strong></div>
    </div>

    <section className="admin-card custom-publish-card custom-source-card">
      <div className="calendar-section-head"><div><span className="section-kicker">1 · Source</span><h2>Upload finished media</h2><p>Choose the Pathway and destination, then bring in the finished file.</p></div>{isVideo ? <Film size={25}/> : <ImageIcon size={25}/>}</div>
      <div className="admin-form-grid custom-source-grid">
        <label><span>Pathway</span><select value={form.pathwaySlug} onChange={(event) => patch({ pathwaySlug: event.target.value })}>{pathways.map((pathway) => <option key={pathway.slug} value={pathway.slug}>{pathway.title}</option>)}</select></label>
        <label><span>Destination</span><select value={form.platform} onChange={(event) => patch({ platform: event.target.value as Platform })}><option value="instagram">Instagram</option><option value="youtube" disabled={!canYouTube}>YouTube{!canYouTube && form.assetId ? " · video only" : ""}</option></select></label>
        <label><span>Media type</span><select value={form.mediaFormat} onChange={(event) => patch({ mediaFormat: event.target.value as MediaFormat })} disabled={!isVideo}><option value="image">Image / Graphic</option>{isVideo ? <><option value="reel">Reel / Short Form</option><option value="long_form" disabled={form.platform === "instagram"}>Long Form</option></> : null}</select></label>
      </div>
      <input ref={inputRef} type="file" hidden accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-m4v,video/webm,video/mpeg,video/x-msvideo" onChange={(event) => chooseFile(event.target.files?.[0] || null)}/>
      <div className="creative-publish-actions custom-media-actions">
        <button type="button" className="button" onClick={() => inputRef.current?.click()} disabled={Boolean(working)}><UploadCloud size={15}/> Choose media</button>
        {file && !form.assetId ? <button type="button" className="button primary" onClick={() => void uploadFile()} disabled={Boolean(working)}>{working === "upload" ? <Loader2 className="spin" size={15}/> : <UploadCloud size={15}/>} Upload {uploadProgress ? `${Math.round(uploadProgress)}%` : ""}</button> : null}
        {form.assetId ? <span className="custom-asset-ready"><CheckCircle2 size={15}/> Asset registered</span> : null}
      </div>
      {previewUrl ? <div className="creative-publish-preview custom-media-preview">{isVideo ? <video src={previewUrl} controls preload="metadata"/> : <img src={previewUrl} alt={form.altText || form.title || "Custom media preview"}/>}</div> : null}
      <p className="custom-pathway-summary"><strong>{selectedPathway?.title}</strong><span>{selectedPathway?.summary}</span></p>
    </section>

    {form.assetId ? <section className="admin-card custom-publish-card custom-package-card">
      <div className="calendar-section-head"><div><span className="section-kicker">2 · Package</span><h2>Tell Sol what this post is about</h2><p>Sol uses your brief, selected Pathway, Scripture context, and the image when available. Every field stays editable.</p></div><Sparkles size={25}/></div>
      <label className="custom-full-field"><span>Brief for Sol</span><textarea rows={4} value={form.brief} onChange={(event) => patch({ brief: event.target.value })} placeholder="Example: This graphic is about Jesus Is God. Make the caption direct and point people into the pathway."/></label>
      <div className="creative-publish-actions custom-sol-actions">
        <button type="button" className="button primary" onClick={() => void generate()} disabled={Boolean(working)}>{working === "sol" ? <Loader2 className="spin" size={15}/> : <Sparkles size={15}/>} Generate with Sol</button>
        <button type="button" className="button custom-theology-button" onClick={() => void checkTheology()} disabled={Boolean(working)}>{working === "theology" ? <Loader2 className="spin" size={15}/> : <ShieldCheck size={15}/>} Check theology</button>
      </div>

      {theologyReview ? <div className={`custom-theology-result is-${theologyReview.status}`}>
        <div className="custom-theology-head"><ShieldCheck size={18}/><div><span>Theology check</span><strong>{theologyReview.status === "pass" ? "Passed" : theologyReview.status === "warning" ? "Review suggested" : "Needs attention"}</strong></div></div>
        <p>{withoutEmDash(theologyReview.summary)}</p>
        {theologyReview.issues.length ? <div className="custom-theology-issues">{theologyReview.issues.map((issue, index) => <article key={`${issue.claim}-${index}`} className={`is-${issue.severity}`}><strong>{withoutEmDash(issue.claim)}</strong><span>{withoutEmDash(issue.reason)}</span>{issue.scripture.length ? <small>{issue.scripture.join(" · ")}</small> : null}</article>)}</div> : null}
      </div> : <div className="custom-theology-pending"><ShieldCheck size={15}/><span>Run Check theology after the copy is ready. Editing the copy clears the previous check.</span></div>}

      <div className="admin-form-grid custom-copy-grid">
        <label><span>Title</span><input value={form.title} maxLength={form.platform === "youtube" ? 100 : 180} onChange={(event) => patch({ title: event.target.value })}/></label>
        <label><span>Internal tags</span><input value={form.internalTags} onChange={(event) => patch({ internalTags: event.target.value })} placeholder="deity, incarnation, colossians 2:9"/></label>
      </div>
      <label className="custom-full-field"><span>{form.platform === "youtube" ? "YouTube description" : "Description / internal summary"}</span><textarea rows={5} value={form.description} onChange={(event) => patch({ description: event.target.value })}/></label>
      <label className="custom-full-field"><span>Instagram caption</span><textarea rows={6} value={form.caption} onChange={(event) => patch({ caption: event.target.value })} disabled={form.platform === "youtube"}/></label>
      <div className="admin-form-grid custom-meta-grid">
        <label><span>Public hashtags</span><input value={form.hashtags} onChange={(event) => patch({ hashtags: event.target.value })} placeholder="#JesusIsGod, #Apostolic"/></label>
        <label><span>YouTube/search tags</span><input value={form.tags} onChange={(event) => patch({ tags: event.target.value })} disabled={form.platform === "instagram"} placeholder="Jesus is God, Oneness, Colossians 2:9"/></label>
        <label><span>Accessibility alt text</span><input value={form.altText} onChange={(event) => patch({ altText: event.target.value })}/></label>
      </div>
      <div className="creative-publish-actions custom-save-actions"><button type="button" className="button" onClick={() => void saveDraft()} disabled={Boolean(working)}>{working === "save" ? <Loader2 className="spin" size={15}/> : <Save size={15}/>} Save draft + calendar</button></div>
    </section> : null}

    {form.assetId ? <section className="admin-card custom-publish-card custom-final-card">
      <div className="calendar-section-head"><div><span className="section-kicker">3 · Publish</span><h2>{form.platform === "instagram" ? "Instagram" : "YouTube"} publish step</h2><p>Choose now or schedule it. Duplicate active publications for the same asset and channel are blocked server-side.</p></div>{form.platform === "instagram" ? <Instagram size={25}/> : <Youtube size={25}/>}</div>
      <div className="admin-form-grid custom-publish-grid">
        <label><span>Timing</span><select value={mode} onChange={(event) => setMode(event.target.value as PublishMode)}><option value="publish_now">Publish now</option><option value="schedule">Schedule</option></select></label>
        {mode === "schedule" ? <label><span>Date + time</span><input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)}/></label> : null}
        {form.platform === "youtube" ? <label><span>YouTube privacy</span><select value={form.privacyStatus} onChange={(event) => patch({ privacyStatus: event.target.value as FormState["privacyStatus"] })}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label> : null}
      </div>
      <div className="creative-publish-actions custom-final-actions"><button type="button" className="button primary" onClick={() => void publish()} disabled={!canPublish || Boolean(working)}>{working === "publish" ? <Loader2 className="spin" size={15}/> : mode === "schedule" ? <CalendarDays size={15}/> : <Send size={15}/>} {mode === "schedule" ? "Add to publishing calendar" : `Publish to ${form.platform === "instagram" ? "Instagram" : "YouTube"}`}</button></div>
    </section> : null}

    {error ? <p className="admin-error">{error}</p> : null}<p className="content-calendar-status custom-publish-status">{message}</p>

    {recent.length ? <section className="admin-card custom-publish-card custom-recent-card"><div className="calendar-section-head"><div><span className="section-kicker">Recent custom media</span><h2>Resume a saved upload</h2><p>Custom media stays organized in Pathway Assets.</p></div></div><div className="calendar-ready-list">{recent.slice(0, 8).map((asset) => <article key={asset.id}><div className="calendar-ready-type"><i>{pathwayAssetMediaKind(metadataString(asset.metadata, "mimeType") || metadataString(asset.metadata, "mime")) === "video" ? "VD" : "IM"}</i><div><span>{asset.status} · {asset.pathway_slug.replaceAll("-", " ")}</span><strong>{asset.title}</strong></div></div><button type="button" className="button" onClick={() => loadAsset(asset)}>Open</button></article>)}</div></section> : null}
  </section>;
}
