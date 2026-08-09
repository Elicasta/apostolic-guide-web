import { BroadcastEditor, type BroadcastSourceOption } from "@/broadcast-editor";
import { articles, answers, pathways, topics } from "@/data";
import { listAdminContent } from "@/database-content";
import { listBroadcasts } from "@/resend-broadcasts";
import { createServiceClient } from "@/supabase";
import { Mail, Radio, Send, Users } from "lucide-react";

function siteUrl(path: string) { return `https://apostolicguide.com${path}`; }

export default async function BroadcastsPage() {
  const databaseItems = await listAdminContent();
  const databaseSources: BroadcastSourceOption[] = databaseItems
    .filter((item) => item.websiteStatus === "published" && ["article", "topic", "answer"].includes(item.kind))
    .map((item) => ({ kind: item.kind as "article" | "topic" | "answer", title: item.title, summary: item.summary, url: siteUrl(`/${item.kind}s/${item.slug}`), publishedAt: item.publishedAt ?? item.updatedAt }));

  const seededSources: BroadcastSourceOption[] = [
    ...articles.map((item) => ({ kind: "article" as const, title: item.title, summary: item.summary, url: siteUrl(`/articles/${item.slug}`), publishedAt: item.publishedAt })),
    ...topics.map((item) => ({ kind: "topic" as const, title: item.title, summary: item.summary, url: siteUrl(`/topics/${item.slug}`) })),
    ...answers.map((item) => ({ kind: "answer" as const, title: item.question, summary: item.shortAnswer, url: siteUrl(`/answers/${item.slug}`) })),
    ...pathways.map((item) => ({ kind: "pathway" as const, title: item.title, summary: item.summary, url: siteUrl(`/pathways/${item.slug}`) }))
  ];

  const seen = new Set<string>();
  const sources = [...databaseSources, ...seededSources]
    .filter((item) => { if (seen.has(item.url)) return false; seen.add(item.url); return true; })
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));

  const service = createServiceClient();
  const counts = { general: 0, content: 0, media: 0 };
  if (service) {
    const [all, content, media] = await Promise.all([
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed"),
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").eq("wants_new_articles", true),
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").eq("wants_live_teachings", true)
    ]);
    counts.general = all.count ?? 0;
    counts.content = content.count ?? 0;
    counts.media = media.count ?? 0;
  }

  const recent = (await listBroadcasts()).slice(0, 8);

  return (
    <>
      <span className="eyebrow">Audience</span>
      <h1>Broadcasts</h1>
      <p className="admin-lede">Send branded emails when Apostolic Guide publishes a new study, answer, pathway, YouTube episode, podcast, or announcement.</p>

      <div className="publishing-metrics">
        <div><Users size={18} /><strong>{counts.general}</strong><span>Subscribers</span></div>
        <div><Mail size={18} /><strong>{counts.content}</strong><span>New content</span></div>
        <div><Radio size={18} /><strong>{counts.media}</strong><span>Teachings & media</span></div>
      </div>

      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Campaign composer</span><h2>Send an update</h2></div><p>Choose a template. Published site content is linked automatically. Every mass email is created as a draft first, so nothing goes out accidentally.</p></div>
        <BroadcastEditor sources={sources} audienceCounts={counts} />
      </section>

      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Delivery history</span><h2>Recent campaigns</h2></div><p>Broadcast delivery is handled by Resend so unsubscribes and list delivery stay out of the website runtime.</p></div>
        {recent.length ? <div className="content-library">{recent.map((broadcast) => <div className="content-library-row" key={broadcast.id}><div><span className="content-kind">Email campaign</span><strong>{broadcast.name || `Campaign ${broadcast.id.slice(0, 8)}`}</strong><small>{broadcast.sent_at ? `Sent ${new Date(broadcast.sent_at).toLocaleString()}` : `Created ${new Date(broadcast.created_at).toLocaleString()}`}</small></div><div className="content-row-end"><span className={broadcast.status === "sent" ? "status-pill" : "status-pill status-pending"}>{broadcast.status}</span></div></div>)}</div> : <div className="empty-state"><Send size={24} /><strong>No campaigns sent yet.</strong><p>Your first draft or sent broadcast will appear here.</p></div>}
      </section>
    </>
  );
}
