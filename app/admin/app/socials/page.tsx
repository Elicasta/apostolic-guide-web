import Link from "next/link";
import { Activity, ArrowUpRight, Bot, Heart, Instagram, MessageCircle, MessageCircleReply, Send, UserPlus, Zap } from "lucide-react";
import { getCommentGuideDashboard } from "@/comment-guide-runtime";
import { getStudioIntelligence } from "@/studio-intelligence";
import { listSocialEventHistory } from "@/social-event-history";
import { getInstagramConnection, socialMetrics } from "@/social-messaging";
import { createServiceClient } from "@/supabase";

function shortStatus(value: unknown) {
  const text = String(value || "waiting").replaceAll("_", " ");
  return text.length > 18 ? `${text.slice(0, 18)}…` : text;
}

export default async function StudioAppSocialsPage() {
  const [comments, automation, events, connection, intelligence] = await Promise.all([
    getCommentGuideDashboard(),
    socialMetrics(),
    listSocialEventHistory(8),
    getInstagramConnection(),
    getStudioIntelligence()
  ]);

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const service = createServiceClient();
  const publicationCounts = new Map<string, number>();
  if (service) {
    const result = await service.from("pathway_publications")
      .select("platform,status,published_at")
      .eq("status", "published")
      .gte("published_at", since)
      .limit(500);
    for (const row of result.data ?? []) {
      const platform = String(row.platform || "other").toLocaleLowerCase();
      publicationCounts.set(platform, (publicationCounts.get(platform) ?? 0) + 1);
    }
  }

  const recentComments = comments.recentJobs.slice(0, 4);
  const recentAutomation = events.slice(0, 4);

  return <main className="studio-app-socials">
    <header className="studio-app-dashboard-head">
      <div><span>Social desk</span><h1>Socials</h1><p>Comments, replies, keywords, publishing activity, and audience movement in one glance.</p></div>
      <Link href="/admin/social" aria-label="Open social automations"><Instagram size={20}/></Link>
    </header>

    <section className="studio-app-dashboard-stats" aria-label="Social metrics">
      <article><MessageCircle size={18}/><strong>{comments.metrics.receivedToday}</strong><span>Comments today</span><small>read by Comment Guide</small></article>
      <article><MessageCircleReply size={18}/><strong>{comments.metrics.repliedToday}</strong><span>Replies today</span><small>{comments.settings.mode} mode</small></article>
      <article><Zap size={18}/><strong>{automation.triggeredToday}</strong><span>Keyword hits</span><small>{automation.active} active rules</small></article>
      <article><UserPlus size={18}/><strong>{intelligence.metrics.newSubscribers7d}</strong><span>New subscribers</span><small>last 7 days</small></article>
    </section>

    <section className="studio-app-dashboard-card">
      <div className="studio-app-dashboard-section-head"><div><span>Platform pulse</span><strong>What is moving</strong></div><Link href="/admin/publishing">Publishing <ArrowUpRight size={14}/></Link></div>
      <div className="studio-app-platform-grid">
        <div><Instagram size={18}/><strong>{connection.webhookSubscribed ? "Live" : "Off"}</strong><span>Instagram</span><small>{publicationCounts.get("instagram") ?? 0} posts / 7d</small></div>
        <div><Send size={18}/><strong>{publicationCounts.get("youtube") ?? 0}</strong><span>YouTube</span><small>published / 7d</small></div>
        <div><Activity size={18}/><strong>{automation.totalSent}</strong><span>Auto replies</span><small>lifetime sent</small></div>
        <div><Heart size={18}/><strong>—</strong><span>Likes / reactions</span><small>insight sync not wired yet</small></div>
      </div>
    </section>

    <section className="studio-app-dashboard-card">
      <div className="studio-app-dashboard-section-head"><div><span>Comments</span><strong>Latest Comment Guide activity</strong></div><Link href="/admin/comment-guide">Open guide <ArrowUpRight size={14}/></Link></div>
      {recentComments.length ? <div className="studio-app-compact-feed">
        {recentComments.map((job) => <Link href="/admin/comment-guide" key={job.id}><div><strong>{job.inbound_text || "Instagram comment"}</strong><span>{job.matched_keyword ? `Keyword: ${job.matched_keyword}` : job.intent?.replaceAll("_", " ") || "comment"}</span></div><small>{shortStatus(job.status)}</small></Link>)}
      </div> : <div className="studio-app-empty-compact">No recent comments yet.</div>}
    </section>

    <section className="studio-app-dashboard-card">
      <div className="studio-app-dashboard-section-head"><div><span>Keyword responses</span><strong>Recent automation events</strong></div><Link href="/admin/social">Rules <ArrowUpRight size={14}/></Link></div>
      {recentAutomation.length ? <div className="studio-app-compact-feed">
        {recentAutomation.map((event) => <Link href="/admin/social" key={String(event.id)}><div><strong>{event.trigger_type === "comment_keyword" ? "Comment keyword" : "Direct message"}</strong><span>{event.matched_keyword ? `“${event.matched_keyword}”` : "No keyword"}</span></div><small>{shortStatus(event.retry_recovered ? "recovered" : event.delivery_status)}</small></Link>)}
      </div> : <div className="studio-app-empty-compact">No automation events yet.</div>}
    </section>

    <section className="studio-app-action-launcher" aria-label="Social actions">
      <Link href="/admin/comment-guide"><Bot size={20}/><strong>Comment Guide</strong><span>Review and control replies</span></Link>
      <Link href="/admin/social"><Zap size={20}/><strong>Keyword Rules</strong><span>DM and comment automations</span></Link>
      <Link href="/admin/publishing"><Send size={20}/><strong>Publishing</strong><span>Posts and videos</span></Link>
      <Link href="/admin/analytics"><Activity size={20}/><strong>Analytics</strong><span>Deeper performance data</span></Link>
    </section>
  </main>;
}
