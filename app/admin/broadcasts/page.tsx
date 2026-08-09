import { BroadcastEditor, type BroadcastSourceOption } from "@/broadcast-editor";
import { rate } from "@/campaign-intelligence";
import { articles, answers, pathways, topics } from "@/data";
import { listAdminContent } from "@/database-content";
import { listCampaignIntelligence, listCampaignLinks } from "@/resend-broadcasts";
import { createServiceClient } from "@/supabase";
import { Activity, CheckCheck, ExternalLink, Eye, Mail, MousePointerClick, Radio, Send, Users } from "lucide-react";

function siteUrl(path: string) { return `https://apostolicguide.com${path}`; }
function number(value: number) { return new Intl.NumberFormat("en-US").format(value); }

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

  const campaigns = await listCampaignIntelligence(20);
  const linkRows = await listCampaignLinks(campaigns.map((campaign) => campaign.id));
  const linksByCampaign = new Map<string, typeof linkRows>();
  for (const link of linkRows) {
    const current = linksByCampaign.get(link.campaign_id) ?? [];
    current.push(link);
    linksByCampaign.set(link.campaign_id, current);
  }

  const totals = campaigns.reduce((sum, campaign) => ({
    sent: sum.sent + campaign.sent,
    delivered: sum.delivered + campaign.delivered,
    opened: sum.opened + campaign.opened,
    clicked: sum.clicked + campaign.clicked,
    siteSessions: sum.siteSessions + campaign.site_sessions,
    appTransitions: sum.appTransitions + campaign.app_transitions
  }), { sent: 0, delivered: 0, opened: 0, clicked: 0, siteSessions: 0, appTransitions: 0 });

  return (
    <>
      <span className="eyebrow">Audience</span>
      <h1>Broadcasts</h1>
      <p className="admin-lede">Send branded emails, then see whether they were delivered, opened, clicked, and whether readers returned to Apostolic Guide.</p>

      <div className="publishing-metrics">
        <div><Users size={18} /><strong>{counts.general}</strong><span>Subscribers</span></div>
        <div><Mail size={18} /><strong>{counts.content}</strong><span>New content</span></div>
        <div><Radio size={18} /><strong>{counts.media}</strong><span>Teachings & media</span></div>
      </div>

      <section className="admin-card publishing-card">
        <div className="card-heading"><div><span className="section-kicker">Campaign composer</span><h2>Send an update</h2></div><p>Choose a template. Published site content is linked automatically. Every mass email is created as a draft first, so nothing goes out accidentally.</p></div>
        <BroadcastEditor sources={sources} audienceCounts={counts} />
      </section>

      <section className="admin-card publishing-card campaign-intelligence-section">
        <div className="card-heading"><div><span className="section-kicker">Campaign intelligence</span><h2>What happened after send</h2></div><p>Email events come from Resend. Website and app-transition activity comes from Apostolic Guide&apos;s first-party analytics.</p></div>

        {campaigns.length ? <>
          <div className="campaign-overview-grid">
            <div><CheckCheck size={18} /><strong>{number(totals.delivered)}</strong><span>Delivered</span><small>{rate(totals.delivered, totals.sent)}% of sent</small></div>
            <div><Eye size={18} /><strong>{rate(totals.opened, totals.delivered)}%</strong><span>Open rate</span><small>{number(totals.opened)} unique opens</small></div>
            <div><MousePointerClick size={18} /><strong>{rate(totals.clicked, totals.delivered)}%</strong><span>Click rate</span><small>{number(totals.clicked)} unique clickers</small></div>
            <div><Activity size={18} /><strong>{number(totals.siteSessions)}</strong><span>Site sessions</span><small>Attributed to email</small></div>
            <div><ExternalLink size={18} /><strong>{number(totals.appTransitions)}</strong><span>App transitions</span><small>After an email visit</small></div>
          </div>

          <p className="campaign-metric-note">Open rate is directional. Email privacy features can cause automated opens, so clicks and return visits are stronger engagement signals.</p>

          <div className="campaign-intelligence-list">
            {campaigns.map((campaign) => {
              const topLink = linksByCampaign.get(campaign.id)?.[0];
              const deliveryRate = rate(campaign.delivered, campaign.sent);
              const openRate = rate(campaign.opened, campaign.delivered);
              const clickRate = rate(campaign.clicked, campaign.delivered);
              return <article className="campaign-intel-card" key={campaign.id}>
                <div className="campaign-intel-header">
                  <div><span className="content-kind">{campaign.campaign_type.replaceAll("_", " ")} · {campaign.audience}</span><h3>{campaign.title}</h3><small>{campaign.sent_at ? `Sent ${new Date(campaign.sent_at).toLocaleString()}` : `Created ${new Date(campaign.created_at).toLocaleString()}`}</small></div>
                  <span className={campaign.status === "sent" ? "status-pill" : "status-pill status-pending"}>{campaign.status}</span>
                </div>
                <div className="campaign-intel-metrics">
                  <div><strong>{number(campaign.sent)}</strong><span>Sent</span></div>
                  <div><strong>{number(campaign.delivered)}</strong><span>Delivered</span><small>{deliveryRate}%</small></div>
                  <div><strong>{number(campaign.opened)}</strong><span>Opened</span><small>{openRate}%</small></div>
                  <div><strong>{number(campaign.clicked)}</strong><span>Clicked</span><small>{clickRate}%</small></div>
                  <div><strong>{number(campaign.site_sessions)}</strong><span>Site visits</span><small>{number(campaign.site_page_views)} page views</small></div>
                  <div><strong>{number(campaign.app_transitions)}</strong><span>Opened app</span><small>{number(campaign.article_completions)} article finishes</small></div>
                </div>
                <div className="campaign-intel-footer">
                  <a href={campaign.destination_url} target="_blank" rel="noreferrer">Destination <ExternalLink size={14} /></a>
                  {topLink ? <span>Top clicked link: {topLink.unique_clickers} reader{topLink.unique_clickers === 1 ? "" : "s"}</span> : <span>{campaign.status === "draft" || campaign.status === "creating" ? "Waiting to send." : "No clicks recorded yet."}</span>}
                  {(campaign.bounced + campaign.complained + campaign.failed + campaign.suppressed) > 0 ? <span className="campaign-delivery-warning">Delivery issues: {campaign.bounced} bounced · {campaign.failed} failed · {campaign.complained} complaints · {campaign.suppressed} suppressed</span> : null}
                </div>
              </article>;
            })}
          </div>
        </> : <div className="empty-state"><Send size={24} /><strong>Campaign intelligence is ready.</strong><p>Your next campaign draft will receive a tracking ID. Once it is sent, delivery, engagement, website visits, and app transitions will populate here automatically.</p></div>}
      </section>
    </>
  );
}
