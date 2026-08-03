import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { listDatabaseContent } from "@/database-content";

export default async function AdminOverviewPage() {
  const published = await listDatabaseContent();

  return (
    <>
      <span className="eyebrow">Editorial system</span>
      <h1>Overview</h1>
      <p className="admin-lede">The website and app remain separate products. This admin controls public editorial content and validated app projections through the shared Supabase database.</p>
      <div className="metric-grid">
        <div className="metric"><strong>{published.length}</strong><span>Database-published pages</span></div>
        <div className="metric"><strong>{topics.length}</strong><span>Launch topics</span></div>
        <div className="metric"><strong>{answers.length}</strong><span>Direct answers</span></div>
        <div className="metric"><strong>{scriptures.length}</strong><span>Curated passages</span></div>
      </div>
      <section className="admin-card">
        <h2>Launch inventory</h2>
        <table className="admin-table"><tbody>
          <tr><td>Articles</td><td>{articles.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Pathways</td><td>{pathways.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Shared database</td><td>{published.length}</td><td><span className="status-pill">{published.length ? "Connected" : "Pending"}</span></td></tr>
        </tbody></table>
      </section>
      <section className="admin-card admin-action-grid">
        <Link href="/admin/content"><strong>Create website content</strong><span>Draft an article, answer, or public page.</span><ArrowRight size={17} /></Link>
        <Link href="/admin/app-content"><strong>Inspect app projections</strong><span>Review what the study app receives.</span><ArrowRight size={17} /></Link>
        <Link href="/admin/analytics"><strong>See what people use</strong><span>Find useful content, weak searches, and app conversions.</span><ArrowRight size={17} /></Link>
      </section>
    </>
  );
}
