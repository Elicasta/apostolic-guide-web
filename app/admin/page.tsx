import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, FileText, Inbox, Route, Users } from "lucide-react";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { getStudioIntelligence } from "@/studio-intelligence";
import { StudioIntelligencePanel } from "@/studio-intelligence-panel";

export default async function AdminOverviewPage() {
  const [published, intelligence] = await Promise.all([listDatabaseContent(), getStudioIntelligence()]);
  const metrics = intelligence.metrics;

  return (
    <>
      <span className="eyebrow">Studio</span>
      <h1>Overview</h1>
      <p className="admin-lede">Operate Apostolic Guide from one place. Publishing, people, conversations, journeys, growth, analytics, and rule-based intelligence share the same system.</p>

      <div className="metric-grid studio-overview-metrics">
        <div className="metric"><Users size={18}/><strong>{metrics.peopleTotal}</strong><span>People</span></div>
        <div className="metric"><Inbox size={18}/><strong>{metrics.unreadConversations}</strong><span>Unread conversations</span></div>
        <div className="metric"><Route size={18}/><strong>{metrics.activeJourneys}</strong><span>Active enrollments</span></div>
        <div className="metric"><FileText size={18}/><strong>{published.length}</strong><span>Published pages</span></div>
        <div className="metric"><BookOpen size={18}/><strong>{pathways.length}</strong><span>Pathways</span></div>
        <div className="metric"><BarChart3 size={18}/><strong>{metrics.subscribersTotal}</strong><span>Subscribers</span></div>
      </div>

      <StudioIntelligencePanel snapshot={intelligence}/>

      <section className="admin-card publishing-card studio-quick-actions">
        <div className="card-heading"><div><span className="section-kicker">Content health</span><h2>Launch inventory</h2></div><p>Core content available across the website and shared app content layer.</p></div>
        <table className="admin-table"><tbody>
          <tr><td>Articles</td><td>{articles.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Topics</td><td>{topics.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Direct answers</td><td>{answers.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Curated passages</td><td>{scriptures.length}</td><td><span className="status-pill">Seeded</span></td></tr>
          <tr><td>Shared database</td><td>{published.length}</td><td><span className="status-pill">{published.length ? "Connected" : "Pending"}</span></td></tr>
        </tbody></table>
      </section>

      <section className="admin-card admin-action-grid studio-quick-actions">
        <Link href="/admin/inbox"><strong>Open Inbox</strong><span>Handle new conversations and human follow-up.</span><ArrowRight size={17} /></Link>
        <Link href="/admin/people"><strong>Open People</strong><span>Review relationship history, tags, and journeys.</span><ArrowRight size={17} /></Link>
        <Link href="/admin/content"><strong>Publish content</strong><span>Create an article, answer, or public page.</span><ArrowRight size={17} /></Link>
        <Link href="/admin/analytics"><strong>Review analytics</strong><span>See the evidence behind study and content signals.</span><ArrowRight size={17} /></Link>
      </section>
    </>
  );
}
