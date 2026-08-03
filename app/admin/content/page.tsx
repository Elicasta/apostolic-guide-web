import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContentEditor } from "@/content-editor";
import { listAdminContent } from "@/database-content";

export default async function AdminContentPage() {
  const content = await listAdminContent();
  return (
    <>
      <span className="eyebrow">Publishing</span>
      <h1>Website content</h1>
      <p className="admin-lede">Create canonical editorial content. Public website status and app status remain separate.</p>
      <section className="admin-card"><h2>New content</h2><ContentEditor /></section>
      <section className="admin-card">
        <h2>Editorial library</h2>
        {content.length ? <table className="admin-table"><thead><tr><th>Title</th><th>Type</th><th>Website</th><th /></tr></thead><tbody>{content.map((item) => <tr key={item.id}><td>{item.title}</td><td>{item.kind}</td><td><span className={item.websiteStatus === "published" ? "status-pill" : "status-pill status-pending"}>{item.websiteStatus ?? item.editorialStatus}</span></td><td><Link className="text-link" href={`/admin/content/${item.id}`}>Edit <ArrowRight size={14} /></Link></td></tr>)}</tbody></table> : <p>No database content yet. The seeded launch library still renders from code.</p>}
      </section>
    </>
  );
}
