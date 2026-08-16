import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, FileText, Globe2, PencilLine, ShieldCheck } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { ContentEditor } from "@/content-editor";
import { getContentPublishingHealth, listAdminContent } from "@/database-content";

export default async function AdminContentPage() {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const [content, health] = await Promise.all([listAdminContent(), getContentPublishingHealth()]);
  const published = content.filter((item) => item.websiteStatus === "published").length;
  const drafts = content.length - published;
  return (
    <>
      <span className="eyebrow">Publishing desk</span>
      <div className="admin-page-heading"><div><h1>Website content</h1><p className="admin-lede">Write, edit, review, and publish the articles and teaching content that live on Apostolic Guide.</p></div></div>
      <div className="publishing-metrics">
        <div><FileText size={18} /><strong>{content.length}</strong><span>Total pieces</span></div>
        <div><Globe2 size={18} /><strong>{published}</strong><span>Published</span></div>
        <div><PencilLine size={18} /><strong>{drafts}</strong><span>Drafts</span></div>
      </div>
      <div className={health.ready ? "system-status system-status-ready" : "system-status"}>{health.ready ? <ShieldCheck size={21}/> : <AlertTriangle size={21}/>}<div><strong>{health.ready ? "Website publishing database is ready" : "Website publishing needs attention"}</strong><p>{health.ready ? "Drafts, published articles, and revision checkpoints are backed by the shared editorial database." : health.error || "The editorial database is unavailable. Creation is disabled until it is repaired."}</p></div></div>
      {canManage && health.ready ? <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Compose</span><h2>New content</h2></div><p>Start with the title. The URL is generated automatically and can be edited before publishing.</p></div><ContentEditor /></section> : canManage ? <section className="admin-card role-readonly-note"><strong>Creation is temporarily disabled</strong><p>{health.error || "The editorial database is not ready."}</p></section> : <section className="admin-card role-readonly-note"><strong>Read-only access</strong><p>Your Studio role can review published and draft content but cannot create, edit, or publish it.</p></section>}
      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Library</span><h2>Editorial library</h2></div><p>Everything written in the publishing desk, including private drafts.</p></div>
        {content.length ? <div className="content-library">{content.map((item) => <Link className="content-library-row" key={item.id} href={canManage ? `/admin/content/${item.id}` : `/${item.kind}s/${item.slug}`}><div><span className="content-kind">{item.kind}</span><strong>{item.title}</strong><small>/{item.slug}</small></div><div className="content-row-end"><span className={item.websiteStatus === "published" ? "status-pill" : "status-pill status-pending"}>{item.websiteStatus === "published" ? "Published" : "Draft"}</span><ArrowRight size={18} /></div></Link>)}</div> : <div className="empty-state"><FileText size={24} /><strong>{health.ready ? "Your editorial library is empty." : "Editorial library unavailable."}</strong><p>{health.ready ? "Create the first database-backed article above. Existing seeded site content is unaffected." : health.error || "Fix the database connection before creating content."}</p></div>}
      </section>
    </>
  );
}
