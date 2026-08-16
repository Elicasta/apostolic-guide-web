"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, CircleAlert, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import type { SolRuntimeReviewView } from "./sol-runtime-review";

type ReviewResponse = { review?: SolRuntimeReviewView; canOperate?: boolean; error?: string };

function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function withReviewContext(route: string, review: SolRuntimeReviewView) {
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}solReview=${encodeURIComponent(review.id)}${review.artifact ? `&artifact=${encodeURIComponent(review.artifact.id)}` : ""}`;
}

export function SolRuntimeReviewClient({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [review, setReview] = useState<SolRuntimeReviewView | null>(null);
  const [canOperate, setCanOperate] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "changes_requested" | "rejected" | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    window.localStorage.setItem("apostolic-guide-sol-open", "0");
    window.dispatchEvent(new Event("sol:minimize"));
    document.querySelector<HTMLButtonElement>('button[aria-label="Minimize Sol"]')?.click();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/sol/reviews/${reviewId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as ReviewResponse;
        if (!response.ok) throw new Error(data.error || `Review request failed (${response.status}).`);
        if (!cancelled) {
          setReview(data.review ?? null);
          setCanOperate(Boolean(data.canOperate));
        }
      })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load review."); });
    return () => { cancelled = true; };
  }, [reviewId]);

  const pending = review?.status === "pending";
  const exactArtifactRoute = useMemo(() => review?.artifact?.location ? withReviewContext(review.artifact.location, review) : null, [review]);

  async function decide(decision: "approved" | "changes_requested" | "rejected") {
    if (!review || busy || !canOperate) return;
    setBusy(decision);
    setError("");
    try {
      const response = await fetch(`/api/admin/sol/reviews/${review.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined })
      });
      const data = await response.json().catch(() => ({})) as ReviewResponse;
      if (!response.ok) throw new Error(data.error || `Review decision failed (${response.status}).`);
      if (data.review) setReview(data.review);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save review decision.");
    } finally {
      setBusy("");
    }
  }

  if (!review && !error) return <main className="sol-review-page"><div className="sol-review-loading"><Loader2 className="is-spinning" size={18}/> Loading exact review…</div></main>;

  if (!review) return <main className="sol-review-page"><div className="sol-review-error"><CircleAlert size={18}/><strong>Review unavailable</strong><p>{error}</p></div></main>;

  return <main className="sol-review-page">
    <section className="sol-review-shell">
      <header className="sol-review-header">
        <div><span>SOL RUNTIME · REVIEW</span><h1>{review.artifact?.title || review.run.goal}</h1><p>{review.requestedAction}</p></div>
        <span className={`sol-review-status is-${review.status}`}>{statusLabel(review.status)}</span>
      </header>

      <div className="sol-review-grid">
        <section className="sol-review-card">
          <div className="sol-review-card-title"><ShieldCheck size={16}/><strong>Artifact</strong></div>
          {review.artifact ? <>
            <dl className="sol-review-facts">
              <div><dt>Type</dt><dd>{statusLabel(review.artifact.type)}</dd></div>
              <div><dt>Verification</dt><dd className={`is-${review.artifact.verificationStatus}`}>{statusLabel(review.artifact.verificationStatus)}</dd></div>
              <div><dt>Workflow</dt><dd>{review.run.workflowKey || "runtime review"}{review.run.workflowVersion ? ` v${review.run.workflowVersion}` : ""}</dd></div>
              <div><dt>Run</dt><dd>{statusLabel(review.run.status)}</dd></div>
            </dl>
            {exactArtifactRoute ? <button type="button" className="sol-review-open" onClick={() => router.push(exactArtifactRoute)}>Open exact artifact <ChevronRight size={14}/></button> : null}
          </> : <p>No artifact reference is attached to this review.</p>}
        </section>

        <section className="sol-review-card">
          <div className="sol-review-card-title"><RotateCcw size={16}/><strong>Runtime decision</strong></div>
          {pending ? <>
            <label className="sol-review-note">Review note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="Optional. Required only when context will help the repair."/></label>
            {error ? <div className="sol-review-inline-error"><CircleAlert size={14}/>{error}</div> : null}
            <div className="sol-review-actions">
              <button type="button" className="is-reject" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("rejected")}>{busy === "rejected" ? <Loader2 className="is-spinning" size={14}/> : <X size={14}/>} Reject</button>
              <button type="button" className="is-changes" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("changes_requested")}>{busy === "changes_requested" ? <Loader2 className="is-spinning" size={14}/> : <RotateCcw size={14}/>} Request changes</button>
              <button type="button" className="is-approve" disabled={!canOperate || Boolean(busy)} onClick={() => void decide("approved")}>{busy === "approved" ? <Loader2 className="is-spinning" size={14}/> : <Check size={14}/>} Approve</button>
            </div>
            {!canOperate ? <small>You have read-only Studio access.</small> : null}
          </> : <div className="sol-review-resolved"><Check size={18}/><div><strong>Decision saved</strong><span>{statusLabel(review.status)}{review.note ? ` · ${review.note}` : ""}</span></div></div>}
        </section>
      </div>

      <section className="sol-review-card sol-review-metadata">
        <div className="sol-review-card-title"><strong>Execution evidence</strong></div>
        <pre>{JSON.stringify(review.artifact?.metadata ?? {}, null, 2)}</pre>
      </section>
    </section>
  </main>;
}
