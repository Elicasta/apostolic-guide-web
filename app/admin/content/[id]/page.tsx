import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ArchiveContentButton, ContentEditor } from "@/content-editor";
import { documentToPlainText, getAdminContent } from "@/database-content";

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const content = await getAdminContent(id);
  if (!content) notFound();

  return (
    <>
      <Link className="back-link" href="/admin/content"><ArrowLeft size={16} /> Website content</Link>
      <span className="eyebrow">Edit {content.kind}</span>
      <h1>{content.title}</h1>
      <p className="admin-lede">Update the canonical website copy and control whether this item is public. App publication remains a separate action.</p>
      <section className="admin-card">
        <ContentEditor initial={{
          id: content.id,
          kind: content.kind,
          title: content.title,
          slug: content.slug,
          summary: content.summary,
          body: documentToPlainText(content.body),
          publishWebsite: content.websiteStatus === "published"
        }} />
      </section>
      <section className="admin-card danger-zone"><h2>Archive</h2><p>Archiving removes the website publication but preserves revisions and audit history.</p><ArchiveContentButton id={content.id} /></section>
    </>
  );
}
