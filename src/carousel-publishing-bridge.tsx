"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { ArrowRight, Loader2, Send } from "lucide-react";

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "draft";
}

function readDraftMeta() {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".carousel-sourcebar select"));
  const pathwaySlug = selects[0]?.value || null;
  const mode = selects[1]?.value || "pathway";
  const title = document.querySelector<HTMLElement>(".carousel-preview-card .carousel-card-heading h2")?.innerText?.trim() || "Carousel draft";
  const position = document.querySelector<HTMLElement>(".carousel-preview-nav strong")?.innerText?.trim() || "01 / 01";
  const styleButton = document.querySelector<HTMLButtonElement>(".carousel-style-tabs button.is-active");
  const style = styleButton?.querySelector("strong")?.textContent?.trim() || "";
  const total = Number(position.match(/\/\s*(\d+)/)?.[1] || 1);
  const activeIndex = Math.max(0, Number(position.match(/^(\d+)/)?.[1] || 1) - 1);
  const output = document.querySelector<HTMLButtonElement>(".carousel-output-option.is-active strong")?.textContent?.trim() || "Instagram Carousel";
  const contentType = output.toLowerCase().includes("post") && !output.toLowerCase().includes("carousel") ? "post" : "carousel";
  const sourceRef = `${pathwaySlug || "carousel"}:${mode}:${contentType}:${slugify(title)}`;
  return { pathwaySlug, mode, title, total, activeIndex, style, output, contentType, sourceRef };
}

async function uploadBoard(node: HTMLElement, meta: ReturnType<typeof readDraftMeta>, index: number) {
  const width = Number.parseInt(node.style.width || "1080", 10) || 1080;
  const height = Number.parseInt(node.style.height || "1350", 10) || 1350;
  const dataUrl = await toPng(node, { width, height, pixelRatio: 1, cacheBust: true });
  const response = await fetch("/api/admin/carousel-studio/publishing-asset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataUrl, pathwaySlug: meta.pathwaySlug, sourceRef: meta.sourceRef, index: index + 1 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.path) throw new Error(data.error || "Publishing image upload failed.");
  return String(data.path);
}

export function CarouselPublishingBridge() {
  const router = useRouter();
  const [target, setTarget] = useState<Element | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const targetRef = useRef<Element | null>(null);

  useEffect(() => {
    const sync = () => {
      const next = document.querySelector(".carousel-output-card") || document.querySelector(".carousel-preview-card");
      if (next !== targetRef.current) { targetRef.current = next; setTarget(next); }
    };
    sync();
    const timer = window.setInterval(sync, 500);
    return () => window.clearInterval(timer);
  }, []);

  async function stageDraft() {
    if (busy) return;
    setBusy(true);
    const meta = readDraftMeta();
    setMessage(meta.contentType === "post" ? "Rendering post…" : "Rendering carousel slides…");
    try {
      const boards = Array.from(document.querySelectorAll<HTMLElement>(".carousel-export-artboard"));
      const selectedBoards = meta.contentType === "post" ? boards.slice(meta.activeIndex, meta.activeIndex + 1) : boards;
      if (!selectedBoards.length) throw new Error("No export artwork is available yet.");
      const storagePaths: string[] = [];
      for (let index = 0; index < selectedBoards.length; index += 1) {
        setMessage(`Preparing ${meta.contentType === "post" ? "post" : `slide ${index + 1} of ${selectedBoards.length}`}…`);
        storagePaths.push(await uploadBoard(selectedBoards[index], meta, index));
      }
      const payload = {
        pathwaySlug: meta.pathwaySlug,
        title: meta.title,
        contentType: meta.contentType,
        platform: "instagram",
        status: "ready",
        source: "carousel-studio",
        sourceRef: meta.sourceRef,
        metadata: { style: meta.style, mode: meta.mode, slides: storagePaths.length, output: meta.output, storagePaths }
      };
      localStorage.setItem("ag-carousel-publishing-handoff-v1", JSON.stringify({ ...meta, storagePaths }));
      const response = await fetch("/api/admin/content-calendar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not stage the Instagram draft.");
      router.push(`/admin/publish?source=carousel-studio&platform=instagram&kind=${meta.contentType}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not prepare publishing assets.");
    } finally {
      setBusy(false);
    }
  }

  if (!target) return null;
  return createPortal(
    <section className="carousel-publishing-bridge" aria-label="Publishing handoff">
      <div><strong><Send size={15}/> Ready for publishing</strong><span>{message || "Render the current post/carousel into durable publishing assets, then continue to Instagram."}</span></div>
      <button type="button" className="button button-dark" onClick={() => void stageDraft()} disabled={busy}>{busy ? <Loader2 className="spin" size={15}/> : null} Continue to Publishing <ArrowRight size={15}/></button>
    </section>,
    target
  );
}
