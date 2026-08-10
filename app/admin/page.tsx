import Link from "next/link";
import { ArrowRight, BarChart3, BookOpen, FileText, Inbox, Route, Users } from "lucide-react";
import { answers, articles, pathways, scriptures, topics } from "@/data";
import { listDatabaseContent } from "@/database-content";
import { createServiceClient } from "@/supabase";

export default async function AdminOverviewPage() {
  const [published, service] = await Promise.all([listDatabaseContent(), Promise.resolve(createServiceClient())]);
  let people = 0;
  let unread = 0;
  let activeJourneys = 0;
  let subscribers = 0;

  if (service) {
    const [peopleResult, inboxResult, journeysResult, subscribersResult] = await Promise.all([
      service.from("people").select("id", { count: "exact", head: true }).neq("status", "archived"),
      service.from("inbox_conversations").select("id", { count: "exact", head: true }).gt("unread_count", 0),
      service.from("growth_journeys").select("id", { count: "exact", head: true }).eq("status", "active"),
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed")
    ]);
    people = peopleResult.count ?? 0;
    unread = inboxResult.count ?? 0;
    activeJourneys = journeysResult.count ?? 0;
    subscribers = subscribersResult.count ?? 0;
  }

  return (
    <>
      <span className="eyebrow">Studio</span>
      <h1>Overview</h1>
      <p className="admin-lede">Operate Apostolic Guide from one place. Publishing, people, conversations, journeys, growth, and analytics now share the same system.</p>

      <div className="metric-grid studio-overview-metrics">
        <div className="metric"><Users size={18}/><strong>{people}</strong><span>People</span></div>
        <div className="metric"><Inbox size={18}/><strong>{unread}</strong><span>Unread conversations</span></div>
        <div className="metric"><Route size={18}/><strong>{activeJourneys}</strong><span>Active journeys</span></div>
        <div className="metric"><FileText size={18}/><strong>{published.length}</strong><span>Published pages</span></div>
        <div className="metric"><BookOpen size={18}/><strong>{pathways.length}</strong><span>Pathways</span></div>
        <div className="metric"><BarChart3 size={18}/><strong>{subscribers}</strong><span>Subscribers</span></div>
      </div>

      <section className="admin-card publishing-card">
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
        <Link href="/admin/analytics"><strong>Review analytics</strong><span>See what people use and where they came from.</span><ArrowRight size={17} /></Link>
      </section>
    </>
  );
}
