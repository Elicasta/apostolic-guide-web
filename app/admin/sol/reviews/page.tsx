import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, Clock3, ShieldCheck } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listPendingSolRuntimeReviews } from "@/sol-runtime-review";

export default async function SolReviewQueuePage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  const reviews = await listPendingSolRuntimeReviews(50).catch(() => []);
  return <div className="sol-v3-control-page">
    <div className="studio-page-heading sol-workspace-heading">
      <div>
        <span className="eyebrow">SOL Runtime</span>
        <h1>Review Queue</h1>
        <p className="admin-lede">These are execution gates, not route shortcuts. Every item points to a persisted decision and an exact artifact.</p>
      </div>
      <span className="studio-role-badge">{reviews.length} pending</span>
    </div>

    {!reviews.length ? <section className="sol-v3-control-card">
      <div className="sol-v3-control-card-head"><CheckCircle2 size={16}/><div><span>Queue clear</span><h3>Nothing is waiting for human review.</h3></div></div>
    </section> : <section className="sol-v3-control-card">
      <div className="sol-v3-control-card-head"><ShieldCheck size={16}/><div><span>Human gates</span><h3>Review before execution can finish.</h3></div></div>
      <div className="sol-v3-control-recipes">
        {reviews.map((review) => <div key={review.id}>
          <b>{review.artifact?.title || review.run.goal}</b>
          <span>{review.artifact?.type?.replaceAll("_", " ") || "artifact"} · {review.artifact?.verificationStatus || "verification pending"} · requested {new Date(review.requestedAt).toLocaleString()}</span>
          <Link href={`/admin/sol/reviews/${review.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontWeight: 800 }}>Review <ChevronRight size={13}/></Link>
        </div>)}
      </div>
    </section>}

    <section className="sol-v3-control-footer">
      <div><strong><Clock3 size={14}/> Approval is runtime state.</strong><span>A run cannot become complete until its pending review is resolved.</span></div>
      <Link href="/admin/sol">Back to Sol</Link>
    </section>
  </div>;
}
