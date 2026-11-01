import Link from "next/link";
import { ArrowUpRight, Bell, Inbox, Mail, Radio, Route, UserPlus, Users } from "lucide-react";
import { getStudioIntelligence } from "@/studio-intelligence";
import { createServiceClient } from "@/supabase";

type EpisodeRow = { id: string; title: string; status: string; exported_project_id: string | null; updated_at: string };

export default async function StudioAppPeoplePage() {
  const intelligence = await getStudioIntelligence();
  const metrics = intelligence.metrics;
  const service = createServiceClient();
  let recentEpisodes: EpisodeRow[] = [];
  if (service) {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const result = await service.from("video_producer_episode_scripts")
      .select("id,title,status,exported_project_id,updated_at")
      .not("exported_project_id", "is", null)
      .gte("updated_at", since)
      .order("updated_at", { ascending: false })
      .limit(5);
    recentEpisodes = (result.data ?? []) as EpisodeRow[];
  }

  const queue = [
    metrics.unreadConversations > 0 ? { href: "/admin/inbox", label: `${metrics.unreadConversations} unread ${metrics.unreadConversations === 1 ? "message" : "messages"}`, detail: "Inbox needs attention", icon: Inbox } : null,
    metrics.followUpConversations > 0 ? { href: "/admin/inbox?status=follow_up", label: `${metrics.followUpConversations} follow-up ${metrics.followUpConversations === 1 ? "conversation" : "conversations"}`, detail: "Marked for human follow-up", icon: Bell } : null,
    metrics.newSubscribers7d > 0 ? { href: "/admin/broadcasts", label: `${metrics.newSubscribers7d} new ${metrics.newSubscribers7d === 1 ? "subscriber" : "subscribers"}`, detail: "Joined in the last 7 days", icon: UserPlus } : null,
    recentEpisodes.length > 0 ? { href: "/admin/broadcasts", label: `${recentEpisodes.length} recent ${recentEpisodes.length === 1 ? "episode" : "episodes"}`, detail: "Check whether they need an announcement", icon: Radio } : null
  ].filter(Boolean) as Array<{ href: string; label: string; detail: string; icon: typeof Inbox }>;

  return <main className="studio-app-people">
    <header className="studio-app-dashboard-head">
      <div><span>Human touch</span><h1>People</h1><p>Messages, subscribers, follow-up, broadcasts, and the moments that need a real person.</p></div>
      <Link href="/admin/inbox" aria-label="Open inbox"><Inbox size={20}/></Link>
    </header>

    <section className="studio-app-dashboard-stats" aria-label="People metrics">
      <article><Inbox size={18}/><strong>{metrics.unreadConversations}</strong><span>Unread</span><small>{metrics.followUpConversations} follow-up</small></article>
      <article><Users size={18}/><strong>{metrics.peopleTotal}</strong><span>People</span><small>known relationships</small></article>
      <article><UserPlus size={18}/><strong>{metrics.newSubscribers7d}</strong><span>New subscribers</span><small>{metrics.subscribersTotal} total</small></article>
      <article><Route size={18}/><strong>{metrics.activeJourneys}</strong><span>Journeys</span><small>{metrics.overdueJourneyActions} overdue</small></article>
    </section>

    <section className="studio-app-dashboard-card studio-app-human-queue">
      <div className="studio-app-dashboard-section-head"><div><span>Human touch queue</span><strong>{queue.length ? "What needs you" : "All caught up"}</strong></div><Link href="/admin/notifications">Notifications <ArrowUpRight size={14}/></Link></div>
      {queue.length ? <div className="studio-app-compact-feed">
        {queue.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.label}><Icon size={17}/><div><strong>{item.label}</strong><span>{item.detail}</span></div><ArrowUpRight size={15}/></Link>; })}
      </div> : <div className="studio-app-empty-compact">No unread messages, follow-up, or fresh announcement cues right now.</div>}
    </section>

    {recentEpisodes.length ? <section className="studio-app-dashboard-card">
      <div className="studio-app-dashboard-section-head"><div><span>Announcement check</span><strong>Recent episode work</strong></div><Link href="/admin/episode-studio">Episodes <ArrowUpRight size={14}/></Link></div>
      <div className="studio-app-compact-feed">
        {recentEpisodes.slice(0, 3).map((episode) => <Link href="/admin/broadcasts" key={episode.id}><div><strong>{episode.title}</strong><span>Video project ready · check announcement</span></div><Mail size={16}/></Link>)}
      </div>
    </section> : null}

    <section className="studio-app-action-launcher" aria-label="People actions">
      <Link href="/admin/inbox"><Inbox size={20}/><strong>Inbox</strong><span>Messages and follow-up</span></Link>
      <Link href="/admin/people"><Users size={20}/><strong>People</strong><span>Relationships and history</span></Link>
      <Link href="/admin/broadcasts"><Mail size={20}/><strong>Broadcasts</strong><span>Email your audience</span></Link>
      <Link href="/admin/journeys"><Route size={20}/><strong>Journeys</strong><span>Follow-up automation</span></Link>
      <Link href="/admin/segments"><UserPlus size={20}/><strong>Segments</strong><span>Audience groups</span></Link>
      <Link href="/admin/notifications"><Bell size={20}/><strong>Notifications</strong><span>Everything waiting on you</span></Link>
    </section>
  </main>;
}
