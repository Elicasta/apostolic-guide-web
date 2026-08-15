import { redirect } from "next/navigation";
import { Activity, Instagram, MessageSquareReply, Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { SocialAutomationManager, type SocialLinkSource } from "@/social-automation-manager";
import { SocialEventRetryButton } from "@/social-event-retry-button";
import { listSocialEventHistory } from "@/social-event-history";
import { getInstagramConnection, listSocialAutomations, socialMetrics } from "@/social-messaging";
import { articles, answers, topics } from "@/data";
import { listAdminContent } from "@/database-content";
import { allPathways } from "@/pathway-catalog";

function siteUrl(path: string) { return `https://apostolicguide.com${path}`; }

export default async function SocialMessagingPage() {
  const permission = await getStudioPermission("view_distribution");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManageAutomations = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_distribution");
  const canManageConnection = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_integrations");
  const [automations, connection, metrics, recentEvents, databaseItems] = await Promise.all([
    listSocialAutomations(),
    getInstagramConnection(),
    socialMetrics(),
    listSocialEventHistory(12),
    listAdminContent()
  ]);

  const databaseSources: SocialLinkSource[] = databaseItems
    .filter((item) => item.websiteStatus === "published" && ["article", "topic", "answer"].includes(item.kind))
    .map((item) => ({ kind: item.kind, label: item.title, url: siteUrl(`/${item.kind}s/${item.slug}`) }));

  const seededSources: SocialLinkSource[] = [
    ...articles.map((item) => ({ kind: "Article", label: item.title, url: siteUrl(`/articles/${item.slug}`) })),
    ...topics.map((item) => ({ kind: "Topic", label: item.title, url: siteUrl(`/topics/${item.slug}`) })),
    ...answers.map((item) => ({ kind: "Answer", label: item.question, url: siteUrl(`/answers/${item.slug}`) })),
    ...allPathways.map((item) => ({ kind: "Pathway", label: item.title, url: siteUrl(`/pathways/${item.slug}`) }))
  ];

  const seen = new Set<string>();
  const sources = [...databaseSources, ...seededSources].filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const automationNames = new Map(automations.map((item) => [item.id, item.name]));

  return (
    <>
      <span className="eyebrow">Social messaging</span>
      <h1>Instagram automations</h1>
      <p className="admin-lede">Configure Instagram and the guide keywords Sol may recognize. Comment Guide reads every public comment first; direct-message rules continue to run here.</p>

      <div className="publishing-metrics social-metrics">
        <div><Instagram size={18} /><strong>{connection.webhookSubscribed ? "Live" : "Off"}</strong><span>Instagram</span></div>
        <div><MessageSquareReply size={18} /><strong>{metrics.active}</strong><span>Active rules</span></div>
        <div><Activity size={18} /><strong>{metrics.triggeredToday}</strong><span>Triggered today</span></div>
        <div><Send size={18} /><strong>{metrics.totalSent}</strong><span>Replies sent</span></div>
      </div>

      <SocialAutomationManager automations={automations} connection={connection} sources={sources} canManageAutomations={canManageAutomations} canManageConnection={canManageConnection}/>

      <section className="admin-card publishing-card social-event-section">
        <div className="card-heading"><div><span className="section-kicker">Activity</span><h2>Recent automation events</h2></div><p>Original failures remain visible. Once a retry succeeds, the event is marked recovered and cannot accidentally send a second private reply.</p></div>
        {recentEvents.length ? <div className="content-library">{recentEvents.map((event) => {
          const status = event.retry_recovered ? "recovered" : event.delivery_status;
          return <div className="content-library-row" key={String(event.id)}><div><span className="content-kind">{event.trigger_type === "comment_keyword" ? "Comment" : "DM"}</span><strong>{event.automation_id ? automationNames.get(String(event.automation_id)) ?? "Deleted automation" : "No matching automation"}</strong><small>{event.matched_keyword ? `Keyword: ${event.matched_keyword} · ` : ""}{new Date(String(event.event_at)).toLocaleString()}</small></div><div className="content-row-end social-event-row-end"><span className={status === "sent" || status === "recovered" ? "status-pill" : status === "failed" ? "status-pill status-error" : "status-pill status-pending"}>{status}</span>{status === "failed" && canManageAutomations ? <SocialEventRetryButton eventId={Number(event.id)} /> : null}</div></div>;
        })}</div> : <div className="empty-state"><Activity size={24} /><strong>No Instagram automation activity yet.</strong><p>Once the webhook is connected and a keyword rule fires, the event will appear here.</p></div>}
      </section>
    </>
  );
}
