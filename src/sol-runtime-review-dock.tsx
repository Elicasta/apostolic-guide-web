"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CircleAlert, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import type { SolRuntimeReviewView } from "./sol-runtime-review";

type ReviewResponse = { review?: SolRuntimeReviewView; canOperate?: boolean; error?: string };

export function SolRuntimeReviewDock() {
  const searchParams = useSearchParams();
  const reviewId = searchParams.get("solReview");
  const [review, setReview] = useState<SolRuntimeReviewView | null>(null);
  const [canOperate, setCanOperate] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!reviewId) {
      setReview(null);
      return;
    }
    window.dispatchEvent(new Event("sol:minimize"));
    document.querySelector<HTMLButtonElement>('button[aria-label="Minimize Sol"]')?.click();
    let cancelled = false;
    void fetch(`/api/admin/sol/reviews/${reviewId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as ReviewResponse;
        if (!response.ok) throw new Error(data.error || `Review request failed (${response.status}).`);
        if (!cancelled) {
          setReview(data.review ?? null);
          setCanOperate(Boolean(data.canOperate));
          setError("");
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load review."); });
    return () => { cancelled = true; };
  }, [reviewId]);

  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    if (!reviewId || !review || review.status !== "pending" || busy || !canOperate) return;
    setBusy(decision);
    setError("");
    try {
      const response = await fetch(`/api/admin/sol/reviews/${reviewId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined })
      });
      const data = await response.json().catch(() => ({})) as ReviewResponse;
      if (!response.ok) throw new Error(data.error || `Review decision failed (${response.status}).`);
      setReview(data.review ?? review);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save review decision.");
    } finally {
      setBusy("");
    }
  }

  if (!reviewId) return null;
  return <aside className="sol-review-dock" aria-label="SOL artifact review">
    <div className="sol-review-dock-copy">
      <span><ShieldCheck size={13}/> SOL REVIEW</span>
      <strong>{review?.artifact?.title || (error ? "Review unavailable" : "Loading exact review…")}</strong>
      <small>{review ? `${review.artifact?.verificationStatus || "verification pending"} · ${review.status.replaceAll("_", " ")}` : error}</small>
    </div>
    {review?.status === "pending" ? <>
      <input aria-label="Review note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional review note"/>
      <div className="sol-review-dock-actions">
        <button type="button" className="is-reject" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("rejected")} aria-label="Reject review">{busy === "rejected" ? <Loader2 className="is-spinning" size={13}/> : <X size={13}/>}</button>
        <button type="button" className="is-changes" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("changes_requested")}>{busy === "changes_requested" ? <Loader2 className="is-spinning" size={13}/> : <RotateCcw size={13}/>} Changes</button>
        <button type="button" className="is-approve" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("approved")}>{busy === "approved" ? <Loader2 className="is-spinning" size={13}/> : <Check size={13}/>} Approve</button>
      </div>
    </> : review ? <div className="sol-review-dock-resolved"><Check size={14}/>{review.status.replaceAll("_", " ")}</div> : error ? <CircleAlert size={15}/> : <Loader2 className="is-spinning" size={15}/>}
    {error && review ? <span className="sol-review-dock-error"><CircleAlert size={12}/>{error}</span> : null}
  </aside>;
}
