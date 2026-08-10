import Link from "next/link";
import { Activity, ArrowRight, BarChart3, CheckCircle2, Instagram, Mail, MessageSquareReply, Radio, Sparkles, Users } from "lucide-react";
import { createServiceClient } from "@/supabase";
import { getInstagramConnection, listRecentSocialEvents, socialMetrics } from "@/social-messaging";
import { listCampaignIntelligence } from "@/resend-broadcasts";

function number(value: number) { return new Intl.NumberFormat("en-US").format(value); }

export default async function GrowthHubPage() {
  const service = createServiceClient();
  const [connection, social, socialEvents, campaigns] = await Promise.all([
    getInstagramConnection(),
    socialMetrics(),
    listRecentSocialEvents(8),
    listCampaignIntelligence(20)
  ]);

  let subscribers = 0;
  let newThisWeek = 0;
  let socialSessions = 0;
  let socialVisitors = 0;
  let socialPageViews = 0;
  let socialAppTransitions = 0;

  if (service) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [allSubs, weekSubs, socialRows] = await Promise.all([
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed"),
      service.from("email_subscribers").select("id", { count: "exact", head: true }).eq("status", "subscribed").gte("created_at", weekAgo),
      service.schema("analytics").from("events").select("event_name,session_id,anonymous_id").eq("utm_source", "instagram").eq("utm_medium", "social")
    ]);
    subscribers = allSubs.count ?? 0;
    newThisWeek = weekSubs.count ?? 0;
    const rows = socialRows.data ?? [];
    socialSessions = new Set(rows.map((row) => row.session_id).filter(Boolean)).size;
    socialVisitors = new Set(rows.map((row) => row.anonymous_id).filter(Boolean)).size;
    socialPageViews = rows.filter((row) => row.event_name === "page_viewed").length;
    socialAppTransitions = rows.filter((row) => row.event_name === "app_link_clicked").length;
  }

  const emailTotals = campaigns.reduce((sum, campaign) => ({
    delivered: sum.delivered + campaign.delivered,
    clicked: sum.clicked + campaign.clicked,
    site: sum.site + campaign.site_sessions,
    app: sum.app + campaign.app_transitions
  }), { delivered: 0, clicked: 0, site: 0, app: 0 });

  const recentCampaigns = campaigns.slice(0, 4);

  return (
    <>
      <span className="eyebrow">Growth Hub</span>
      <div className="growth-heading">
        <div><h1>Audience & journeys</h1><p className="admin-lede">One place to see how people move from social and email into Apostolic Guide, then into deeper study and the app.</p></div>
        <div className="growth-heading-actions"><Link className="button button-outline" href="/admin/broadcasts"><Mail size={16}/> New broadcast</Link><Link className="button button-crimson" href="/admin/social"><Instagram size={16}/> New automation</Link></div>
      </div>

      <div className="growth-kpis">
        <div><Users size={20}/><span>Audience</span><strong>{number(subscribers)}</strong><small>+{number(newThisWeek)} this week</small></div>
        <div><MessageSquareReply size={20}/><span>Social replies</span><strong>{number(social.totalSent)}</strong><small>{number(social.active)} active rules</small></div>
        <div><Activity size={20}/><span>Social site visits</span><strong>{number(socialSessions)}</strong><small>{number(socialVisitors)} people</small></div>
        <div><Mail size={20}/><span>Email site visits</span><strong>{number(emailTotals.site)}</strong><small>{number(emailTotals.clicked)} email clickers</small></div>
        <div><Sparkles size={20}/><span>App transitions</span><strong>{number(emailTotals.app + socialAppTransitions)}</strong><small>From tracked growth channels</small></div>
      </div>

      <div className="growth-channel-grid">
        <section className="admin-card growth-channel-card">
          <div className="growth-channel-head"><div className="growth-channel-icon"><Instagram size={22}/></div><div><span className="section-kicker">Instagram</span><h2>{connection.username ? `@${connection.username}` : "Instagram"}</h2></div><span className={connection.webhookSubscribed ? "status-pill" : "status-pill status-pending"}>{connection.webhookSubscribed ? "Connected" : "Setup"}</span></div>
          <div className="growth-channel-stats"><div><strong>{number(social.triggeredToday)}</strong><span>Triggered today</span></div><div><strong>{number(social.sentToday)}</strong><span>Replies today</span></div><div><strong>{number(socialPageViews)}</strong><span>Tracked page views</span></div></div>
          <Link className="growth-card-link" href="/admin/social">Manage automations <ArrowRight size={16}/></Link>
        </section>

        <section className="admin-card growth-channel-card">
          <div className="growth-channel-head"><div className="growth-channel-icon"><Mail size={22}/></div><div><span className="section-kicker">Email</span><h2>Broadcasts</h2></div><span className="status-pill">Live</span></div>
          <div className="growth-channel-stats"><div><strong>{number(emailTotals.delivered)}</strong><span>Delivered</span></div><div><strong>{number(emailTotals.clicked)}</strong><span>Unique clickers</span></div><div><strong>{number(emailTotals.site)}</strong><span>Site sessions</span></div></div>
          <Link className="growth-card-link" href="/admin/broadcasts">Open broadcasts <ArrowRight size={16}/></Link>
        </section>
      </div>

      <section className="admin-card publishing-card growth-funnel-card">
        <div className="card-heading"><div><span className="section-kicker">Journey</span><h2>Tracked growth funnel</h2></div><p>These numbers come from first-party site analytics and connected delivery channels. As social campaign links begin carrying attribution, this funnel becomes more precise automatically.</p></div>
        <div className="growth-funnel">
          <div><span>Reach</span><strong>{number(emailTotals.delivered + social.totalSent)}</strong><small>Email deliveries + social replies</small></div><ArrowRight size={20}/>
          <div><span>Site sessions</span><strong>{number(emailTotals.site + socialSessions)}</strong><small>Tracked visits</small></div><ArrowRight size={20}/>
          <div><span>App opens</span><strong>{number(emailTotals.app + socialAppTransitions)}</strong><small>Tracked transitions</small></div>
        </div>
      </section>

      <div className="growth-lower-grid">
        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Recent social activity</span><h2>Automation events</h2></div><Link href="/admin/social">View all</Link></div>
          {socialEvents.length ? <div className="growth-activity-list">{socialEvents.map((event) => <div key={String(event.id)}><div className="growth-activity-icon"><Instagram size={16}/></div><div><strong>{event.matched_keyword ? `Keyword: ${event.matched_keyword}` : "Instagram event"}</strong><small>{event.trigger_type === "comment_keyword" ? "Comment" : "DM"} · {new Date(String(event.event_at)).toLocaleString()}</small></div><span className={event.delivery_status === "sent" ? "status-pill" : "status-pill status-pending"}>{String(event.delivery_status)}</span></div>)}</div> : <div className="empty-state"><Activity size={24}/><strong>No social events yet.</strong><p>Once Meta webhooks start firing, activity will appear here.</p></div>}
        </section>

        <section className="admin-card publishing-card">
          <div className="card-heading"><div><span className="section-kicker">Recent campaigns</span><h2>Email performance</h2></div><Link href="/admin/broadcasts">View all</Link></div>
          {recentCampaigns.length ? <div className="growth-activity-list">{recentCampaigns.map((campaign) => <div key={campaign.id}><div className="growth-activity-icon"><Mail size={16}/></div><div><strong>{campaign.title}</strong><small>{campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : campaign.status}</small></div><span className="growth-inline-metric">{campaign.clicked} clicks</span></div>)}</div> : <div className="empty-state"><Radio size={24}/><strong>No campaigns yet.</strong><p>Your first real broadcast will appear here with delivery and conversion data.</p></div>}
        </section>
      </div>

      <section className="admin-card growth-next-card"><div><CheckCircle2 size={20}/><div><strong>Growth Hub foundation is live.</strong><p>Instagram automations, email broadcasts, subscriber growth, campaign intelligence, and channel attribution now meet in one dashboard. Next we can add contacts, unified inbox, and multi-step journeys without changing the underlying channel tools.</p></div></div><Link href="/admin/analytics">Open full analytics <BarChart3 size={16}/></Link></section>
    </>
  );
}
