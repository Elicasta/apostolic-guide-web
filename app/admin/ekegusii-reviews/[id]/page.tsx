import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { getEkegusiiCorrection } from "@/ekegusii-review-data";
import { pathwayBySlug } from "@/pathway-catalog";
import { bibleSourcedEkegusiiSeed } from "@/ekegusii-language-audit";
import { ekegusiiBibleReference } from "@/ekegusii-bible-references";
import { EkegusiiReviewControls } from "@/ekegusii-review-controls";

export const dynamic = "force-dynamic";
export default async function EkegusiiReviewDetail({ params }: { params: Promise<{ id: string }> }) {
  const permission = await getStudioPermission("manage_content");
  if (!permission.allowed) redirect("/admin");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const record = await getEkegusiiCorrection(id);
  if (!record) notFound();
  const pathway = pathwayBySlug(record.pathway_slug);
  const canonical = pathway?.steps[record.step_index];
  const original = bibleSourcedEkegusiiSeed(record.pathway_slug).steps?.[String(record.step_index)];
  const scripture = ekegusiiBibleReference(record.scripture_reference);
  return <div className="eg-admin-review">
    <Link className="people-back" href="/admin/ekegusii-reviews"><ArrowLeft size={16}/> Ekegusii Reviews</Link>
    <div className="studio-page-heading"><div><span className="eyebrow">Translation correction · {record.status.replace("_", " ")}</span>
      <h1>{pathway?.title ?? record.pathway_slug}</h1>
      <p className="admin-lede">Step {record.step_index + 1} · {record.scripture_reference} · Submitted {new Date(record.created_at).toLocaleString()}</p></div>
      <Link className="button button-outline" href={"/ekegusii/pathways/" + record.pathway_slug + "#step-" + (record.step_index + 1)} target="_blank">View teaching <ExternalLink size={15}/></Link>
    </div>
    <div className="eg-admin-detail-layout">
      <section className="admin-card eg-admin-source">
        <span className="section-kicker">Canonical source and Scripture</span><h2>Original teaching</h2>
        {canonical ? <><strong>{canonical.title}</strong><p>{canonical.explanation}</p><p><strong>Transition:</strong> {canonical.hook}</p></> : <p>The English source changed; do not approve until checked.</p>}
        <p><a target="_blank" rel="noopener noreferrer" href={scripture?.url ?? "https://ebible.org/guz/"}>Read {scripture?.label ?? record.scripture_reference} in the Ekegusii Bible <ExternalLink size={13}/></a></p>
        <hr/><span className="section-kicker">Existing initial draft</span>
        <p><strong>{original?.title}</strong></p><p>{original?.explanation}</p>
        <hr/><span className="section-kicker">Submitted by</span>
        <p><strong>{record.reviewer_name}</strong><br/>{record.reviewer_email}<br/>{record.reviewer_location}</p>
        <p><strong>Reviewer notes:</strong> {record.reviewer_notes || "None"}</p>
        {record.inbox_conversation_id && <Link href={"/admin/inbox/" + record.inbox_conversation_id}>View Inbox conversation</Link>}
      </section>
      <EkegusiiReviewControls record={record}/>
    </div>
  </div>;
}
