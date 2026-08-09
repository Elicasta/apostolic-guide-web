import Link from "next/link";
import { ArrowRight, FileText, Globe2, PencilLine } from "lucide-react";
import { ContentEditor } from "@/content-editor";
import { listAdminContent } from "@/database-content";

export default async function AdminContentPage() {
  const content = await listAdminContent();
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
      <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Compose</span><h2>New content</h2></div><p>Start with the title. The URL is generated automatically and can be edited before publishing.</p></div><ContentEditor /></section>
      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Library</span><h2>Editorial library</h2></div><p>Everything written in the publishing desk, including private drafts.</p></div>
        {content.length ? <div className="content-library">{content.map((item) => <Link className="content-library-row" key={item.id} href={`/admin/content/${item.id}`}><div><span className="content-kind">{item.kind}</span><strong>{item.title}</strong><small>/{item.slug}</small></div><div className="content-row-end"><span className={item.websiteStatus === "published" ? "status-pill" : "status-pill status-pending"}>{item.websiteStatus === "published" ? "Published" : "Draft"}</span><ArrowRight size={18} /></div></Link>)}</div> : <div className="empty-state"><FileText size={24} /><strong>Your editorial library is empty.</strong><p>Create the first database-backed article above. Existing seeded site content is unaffected.</p></div>}
      </section>
    </>
  );
}
