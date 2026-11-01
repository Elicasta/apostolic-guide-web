import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock3, FilePenLine, Languages } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listEkegusiiCorrections } from "@/ekegusii-review-data";
import { pathwayBySlug } from "@/pathway-catalog";

const statuses = ["all", "submitted", "in_review", "approved", "rejected", "published"] as const;
export const dynamic = "force-dynamic";
export default async function EkegusiiReviews({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const permission = await getStudioPermission("manage_content");
  if (!permission.allowed) redirect("/admin");
  const params = await searchParams;
  const selected = statuses.includes(params.status as typeof statuses[number]) ? params.status : "all";
  const { rows, error } = await listEkegusiiCorrections();
  const filtered = rows.filter(row => selected === "all" || row.status === selected);
  const waiting = rows.filter(row => row.status === "submitted").length;
  const inReview = rows.filter(row => row.status === "in_review").length;
  const approved = rows.filter(row => row.status === "approved").length;
  return <div className="eg-admin-review">
    <div className="studio-page-heading"><div>
      <span className="eyebrow">Library · Language editions</span>
      <h1>Ekegusii Reviews</h1>
      <p className="admin-lede">Review submitted corrections, keep a clear approval trail, and publish accepted wording into the Ekegusii reading edition.</p>
    </div><Link className="button button-outline" href="/ekegusii" target="_blank">Open reader</Link></div>
    <div className="studio-kpi-grid studio-kpi-grid-three">
      <div className="studio-kpi"><Clock3 size={18}/><span>New submissions</span><strong>{waiting}</strong><small>Awaiting review</small></div>
      <div className="studio-kpi"><FilePenLine size={18}/><span>In review</span><strong>{inReview}</strong><small>Being checked</small></div>
      <div className="studio-kpi"><CheckCircle2 size={18}/><span>Ready to publish</span><strong>{approved}</strong><small>Approved, not published</small></div>
    </div>
    <section className="admin-card eg-admin-queue">
      <div className="studio-section-head"><div><span className="section-kicker">Submissions</span><h2>Translation correction queue</h2></div><span>{filtered.length} shown</span></div>
      <nav aria-label="Filter review status" className="eg-review-filters">{statuses.map(status=><Link key={status} className={selected === status ? "selected" : ""} href={status === "all" ? "/admin/ekegusii-reviews" : "?status=" + status}>{status.replace("_"," ")}</Link>)}</nav>
      {error && <p role="alert" className="eg-admin-error">Unable to read the correction queue: {error}</p>}
      {filtered.length ? <div className="eg-admin-rows">{filtered.map(row => <Link href={"/admin/ekegusii-reviews/" + row.id} key={row.id} className="eg-admin-row">
        <div className="eg-admin-row-icon"><Languages size={20}/></div>
        <div><strong>{pathwayBySlug(row.pathway_slug)?.title ?? row.pathway_slug}</strong><p>Step {row.step_index + 1} · {row.scripture_reference} · {row.reviewer_name} ({row.reviewer_location || "Unknown location"})</p><small>Received {new Date(row.created_at).toLocaleString()}</small></div>
        <span className={"eg-admin-status " + row.status}>{row.status.replace("_"," ")}</span>
      </Link>)}</div> : <div className="empty-state"><Languages size={26}/><strong>No corrections in this view.</strong><p>New submissions from the Ekegusii reader will be listed here.</p></div>}
    </section>
  </div>;
}
